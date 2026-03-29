"""
Reflection — LLM generates, then critiques its own output and revises.

Unlike Evaluator-Optimizer (which uses a separate evaluator), Reflection
uses the same LLM with a critic prompt to self-assess and revise until
the output meets the criteria or max iterations is reached.

Design doc:  ../../design.md
Overview:    ../../overview.md
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


# ── Interface ─────────────────────────────────────────────────────────────────

class LLM(Protocol):
    def generate(self, messages: list[dict]) -> str: ...


# ── Core types ────────────────────────────────────────────────────────────────

@dataclass
class ReflectionStep:
    iteration: int
    draft: str
    critique: str
    passed: bool


@dataclass
class ReflectionResult:
    final_output: str
    passed: bool
    iterations: list[ReflectionStep] = field(default_factory=list)


# ── Prompts ───────────────────────────────────────────────────────────────────

CRITIC_PROMPT = """\
Review the following output against these criteria:
{criteria}

Output to review:
{draft}

Respond in this exact format:
VERDICT: <pass or revise>
ISSUES: <comma-separated list of specific issues, or "none">
SUGGESTION: <one concrete improvement instruction, or "none">"""

REVISE_PROMPT = """\
Revise the following output to address the critique.

Original task: {task}
Current output: {draft}
Issues: {issues}
Suggested improvement: {suggestion}

Produce the revised output only."""


# ── Implementation ────────────────────────────────────────────────────────────

class ReflectionAgent:
    """
    Generates output, reflects on it with a critic prompt, then revises.
    Both generation and critique use the same LLM instance.
    """

    def __init__(
        self,
        llm: LLM,
        criteria: str,
        max_iterations: int = 3,
        system: str = "",
    ):
        self.llm = llm
        self.criteria = criteria
        self.max_iterations = max_iterations
        self.system = system

    def _generate(self, task: str) -> str:
        messages: list[dict] = []
        if self.system:
            messages.append({"role": "system", "content": self.system})
        messages.append({"role": "user", "content": task})
        return self.llm.generate(messages)

    def _critique(self, draft: str) -> tuple[bool, str, str]:
        """Returns (passed, issues, suggestion)."""
        messages = [{"role": "user", "content": CRITIC_PROMPT.format(
            criteria=self.criteria, draft=draft
        )}]
        raw = self.llm.generate(messages)

        passed, issues, suggestion = False, "", ""
        for line in raw.splitlines():
            if line.startswith("VERDICT:"):
                passed = "pass" in line.lower()
            elif line.startswith("ISSUES:"):
                issues = line.split(":", 1)[1].strip()
            elif line.startswith("SUGGESTION:"):
                suggestion = line.split(":", 1)[1].strip()

        return passed, issues, suggestion

    def _revise(self, task: str, draft: str, issues: str, suggestion: str) -> str:
        messages = [{"role": "user", "content": REVISE_PROMPT.format(
            task=task, draft=draft, issues=issues, suggestion=suggestion
        )}]
        return self.llm.generate(messages)

    def run(self, task: str) -> ReflectionResult:
        draft = self._generate(task)
        iterations: list[ReflectionStep] = []

        for i in range(self.max_iterations):
            passed, issues, suggestion = self._critique(draft)
            iterations.append(ReflectionStep(
                iteration=i + 1,
                draft=draft,
                critique=f"Issues: {issues} | Suggestion: {suggestion}",
                passed=passed,
            ))

            if passed or issues.lower() in ("", "none"):
                return ReflectionResult(
                    final_output=draft,
                    passed=True,
                    iterations=iterations,
                )

            draft = self._revise(task, draft, issues, suggestion)

        return ReflectionResult(
            final_output=draft,
            passed=False,
            iterations=iterations,
        )


# ── Example ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":

    class MockLLM:
        def __init__(self):
            self._call = 0

        def generate(self, messages: list[dict]) -> str:
            self._call += 1
            content = messages[-1]["content"]
            if "VERDICT" in content:
                # Critic — pass on second iteration
                if self._call >= 4:
                    return "VERDICT: pass\nISSUES: none\nSUGGESTION: none"
                return "VERDICT: revise\nISSUES: too vague, lacks examples\nSUGGESTION: Add concrete code example"
            return f"[draft v{self._call}] Explanation of {content[:40]}..."

    agent = ReflectionAgent(
        llm=MockLLM(),
        criteria="Must be accurate, include a code example, and be under 200 words.",
        max_iterations=3,
        system="You are a technical writer.",
    )

    result = agent.run("Explain what a context window is in LLMs")
    print(f"Passed: {result.passed}")
    print(f"Iterations: {len(result.iterations)}")
    for step in result.iterations:
        print(f"  Iter {step.iteration}: {'✓' if step.passed else '✗'}  {step.critique[:60]}")
    print(f"\nFinal output:\n{result.final_output}")
