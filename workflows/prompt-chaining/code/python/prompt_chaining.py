"""
Prompt Chaining — Sequential LLM calls with optional validation gates.

Each step's output becomes the next step's input. Gates check quality
before proceeding; on failure the chain halts and returns the failing step.

Design doc:  ../../design.md
Overview:    ../../overview.md
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Protocol


# ── LLM interface ─────────────────────────────────────────────────────────────
# Implement this with any provider: OpenAI, Anthropic, local model, etc.

class LLM(Protocol):
    def generate(self, messages: list[dict]) -> str:
        """Send messages and return the assistant's response text."""
        ...


# ── Core types ────────────────────────────────────────────────────────────────

@dataclass
class ChainStep:
    name: str
    prompt_template: str                          # Use {input} for previous output
    validate: Callable[[str], bool] = lambda _: True  # Gate: return False to halt


@dataclass
class ChainResult:
    success: bool
    output: str
    step_outputs: list[str] = field(default_factory=list)
    failed_at: str | None = None  # Step name where validation failed


# ── Implementation ────────────────────────────────────────────────────────────

class PromptChain:
    """
    Runs a sequence of LLM calls where each output feeds into the next step.

    Usage:
        chain = PromptChain(llm, steps=[...])
        result = chain.run("initial input")
    """

    def __init__(self, llm: LLM, steps: list[ChainStep], system: str = ""):
        self.llm = llm
        self.steps = steps
        self.system = system

    def run(self, input: str) -> ChainResult:
        current = input
        step_outputs: list[str] = []

        for step in self.steps:
            messages: list[dict] = []
            if self.system:
                messages.append({"role": "system", "content": self.system})
            messages.append({
                "role": "user",
                "content": step.prompt_template.format(input=current),
            })

            output = self.llm.generate(messages)

            if not step.validate(output):
                return ChainResult(
                    success=False,
                    output=output,
                    step_outputs=step_outputs,
                    failed_at=step.name,
                )

            step_outputs.append(output)
            current = output

        return ChainResult(success=True, output=current, step_outputs=step_outputs)


# ── Example ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":

    class MockLLM:
        """Stub — replace with your actual LLM client."""
        def generate(self, messages: list[dict]) -> str:
            content = messages[-1]["content"]
            return f"[step output from: {content[:50].strip()}]"

    chain = PromptChain(
        llm=MockLLM(),
        system="You are a precise document processor.",
        steps=[
            ChainStep(
                name="extract",
                prompt_template="Extract the key facts from this text:\n\n{input}",
                validate=lambda out: len(out) > 0,
            ),
            ChainStep(
                name="summarize",
                prompt_template="Summarize these facts in 2-3 sentences:\n\n{input}",
            ),
            ChainStep(
                name="format",
                prompt_template="Format this summary as a markdown bullet list:\n\n{input}",
            ),
        ],
    )

    result = chain.run("AI is transforming healthcare through diagnostics and drug discovery.")
    print(f"Success:  {result.success}")
    print(f"Steps:    {len(result.step_outputs)}")
    print(f"Output:\n{result.output}")
