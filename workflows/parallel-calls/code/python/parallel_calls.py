"""
Parallel Calls — Concurrent LLM calls on independent inputs, aggregated at the end.

Splits input into independent chunks, runs all LLM calls concurrently,
then combines results. Total latency ≈ max(individual call latency).

Design doc:  ../../design.md
Overview:    ../../overview.md
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Callable, Protocol


# ── LLM interface ─────────────────────────────────────────────────────────────

class LLM(Protocol):
    def generate(self, messages: list[dict]) -> str: ...


# ── Core types ────────────────────────────────────────────────────────────────

@dataclass
class BranchResult:
    index: int
    input: str
    output: str
    error: str | None = None


@dataclass
class ParallelResult:
    outputs: list[str]               # Ordered branch outputs
    aggregated: str                  # Final combined result
    errors: list[BranchResult] = field(default_factory=list)


# ── Implementation ────────────────────────────────────────────────────────────

class ParallelCalls:
    """
    Fans out to N concurrent LLM calls then aggregates the results.

    Usage:
        runner = ParallelCalls(llm, max_workers=4)
        result = runner.run(chunks, branch_prompt, aggregate_prompt)
    """

    def __init__(
        self,
        llm: LLM,
        max_workers: int = 8,
        system: str = "",
        on_error: str = "skip",       # "skip" | "raise"
    ):
        self.llm = llm
        self.max_workers = max_workers
        self.system = system
        self.on_error = on_error

    def _call_branch(self, index: int, chunk: str, prompt_template: str) -> BranchResult:
        try:
            messages: list[dict] = []
            if self.system:
                messages.append({"role": "system", "content": self.system})
            messages.append({
                "role": "user",
                "content": prompt_template.format(input=chunk),
            })
            output = self.llm.generate(messages)
            return BranchResult(index=index, input=chunk, output=output)
        except Exception as exc:
            if self.on_error == "raise":
                raise
            return BranchResult(index=index, input=chunk, output="", error=str(exc))

    def run(
        self,
        chunks: list[str],
        branch_prompt: str,           # Applied to each chunk; use {input}
        aggregate_prompt: str,        # Applied to joined outputs; use {input}
    ) -> ParallelResult:
        branch_results: list[BranchResult] = [None] * len(chunks)  # type: ignore

        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            futures = {
                pool.submit(self._call_branch, i, chunk, branch_prompt): i
                for i, chunk in enumerate(chunks)
            }
            for future in as_completed(futures):
                result = future.result()
                branch_results[result.index] = result

        errors = [r for r in branch_results if r.error]
        outputs = [r.output for r in branch_results if not r.error]

        # Aggregate all branch outputs into one final call
        combined = "\n\n---\n\n".join(
            f"[Part {r.index + 1}]\n{r.output}"
            for r in branch_results if not r.error
        )
        agg_messages: list[dict] = []
        if self.system:
            agg_messages.append({"role": "system", "content": self.system})
        agg_messages.append({
            "role": "user",
            "content": aggregate_prompt.format(input=combined),
        })
        aggregated = self.llm.generate(agg_messages)

        return ParallelResult(outputs=outputs, aggregated=aggregated, errors=errors)


# ── Example ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import time

    class MockLLM:
        def generate(self, messages: list[dict]) -> str:
            time.sleep(0.05)  # Simulate network latency
            return f"[analysis of: {messages[-1]['content'][:40]}]"

    runner = ParallelCalls(llm=MockLLM(), max_workers=4)

    # Evaluate 4 independent document sections in parallel
    sections = [
        "Section 1: Market analysis shows growth in Q3...",
        "Section 2: Technical architecture uses microservices...",
        "Section 3: Financial projections indicate 20% YoY...",
        "Section 4: Risk factors include regulatory changes...",
    ]

    result = runner.run(
        chunks=sections,
        branch_prompt="Summarize this section in one sentence:\n\n{input}",
        aggregate_prompt="Combine these section summaries into an executive overview:\n\n{input}",
    )

    print(f"Branches completed: {len(result.outputs)}")
    print(f"Errors: {len(result.errors)}")
    print(f"\nAggregated:\n{result.aggregated}")
