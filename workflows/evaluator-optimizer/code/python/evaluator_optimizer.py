"""
Evaluator-Optimizer — Generate-evaluate feedback loop.

A generator produces output; an evaluator scores it and provides feedback;
the optimizer converts that feedback into improvement instructions for the
next generation. Loops until score meets threshold or max iterations.

Design doc:  ../../design.md
Overview:    ../../overview.md
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


# ── LLM interface ─────────────────────────────────────────────────────────────

class LLM(Protocol):
    def generate(self, messages: list[dict]) -> str: ...


# ── Core types ────────────────────────────────────────────────────────────────

@dataclass
class Iteration:
    number: int
    output: str
    score: float         # 0.0 – 1.0
    feedback: str
    passed: bool


@dataclass
class EvalResult:
    final_output: str
    passed: bool
    iterations: list[Iteration] = field(default_factory=list)
    final_score: float = 0.0


# ── Implementation ────────────────────────────────────────────────────────────

class EvaluatorOptimizer:
    """
    Iteratively improves LLM output via an evaluate-then-optimize loop.

    Usage:
        eo = EvaluatorOptimizer(generator_llm, evaluator_llm, criteria="...")
        result = eo.run("Write a haiku about databases")
    """

    EVALUATE_PROMPT = """\
Evaluate the following output against these criteria:
{criteria}

Output to evaluate:
{output}

Respond in this exact format:
SCORE: <number from 0.0 to 1.0>
FEEDBACK: <specific, actionable feedback for improvement>
PASS: <yes or no>"""

    IMPROVE_PROMPT = """\
Improve the following output based on the feedback provided.

Original task: {task}
Current output: {output}
Feedback: {feedback}

Produce an improved version that addresses all feedback points."""

    def __init__(
        self,
        generator: LLM,
        evaluator: LLM,
        criteria: str,
        threshold: float = 0.8,
        max_iterations: int = 3,
    ):
        self.generator = generator
        self.evaluator = evaluator
        self.criteria = criteria
        self.threshold = threshold
        self.max_iterations = max_iterations

    def _generate(self, task: str, previous: str | None, feedback: str | None) -> str:
        if previous is None:
            messages = [{"role": "user", "content": task}]
        else:
            messages = [{"role": "user", "content": self.IMPROVE_PROMPT.format(
                task=task, output=previous, feedback=feedback
            )}]
        return self.generator.generate(messages)

    def _evaluate(self, output: str) -> tuple[float, str, bool]:
        messages = [{"role": "user", "content": self.EVALUATE_PROMPT.format(
            criteria=self.criteria, output=output
        )}]
        raw = self.evaluator.generate(messages)

        # Parse structured response
        score, feedback, passed = 0.5, raw, False
        for line in raw.splitlines():
            if line.startswith("SCORE:"):
                try:
                    score = float(line.split(":", 1)[1].strip())
                except ValueError:
                    pass
            elif line.startswith("FEEDBACK:"):
                feedback = line.split(":", 1)[1].strip()
            elif line.startswith("PASS:"):
                passed = line.split(":", 1)[1].strip().lower() == "yes"

        return score, feedback, passed

    def run(self, task: str) -> EvalResult:
        output: str | None = None
        feedback: str | None = None
        iterations: list[Iteration] = []

        for i in range(self.max_iterations):
            output = self._generate(task, output, feedback)
            score, feedback, passed = self._evaluate(output)

            iterations.append(Iteration(
                number=i + 1,
                output=output,
                score=score,
                feedback=feedback,
                passed=passed,
            ))

            if passed or score >= self.threshold:
                return EvalResult(
                    final_output=output,
                    passed=True,
                    iterations=iterations,
                    final_score=score,
                )

        # Exhausted iterations — return best attempt
        return EvalResult(
            final_output=output or "",
            passed=False,
            iterations=iterations,
            final_score=iterations[-1].score if iterations else 0.0,
        )


# ── Example ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":

    class MockLLM:
        def __init__(self, name: str):
            self.name = name
            self._call_count = 0

        def generate(self, messages: list[dict]) -> str:
            self._call_count += 1
            content = messages[-1]["content"]
            if self.name == "evaluator":
                score = min(0.6 + self._call_count * 0.2, 1.0)
                passed = "yes" if score >= 0.8 else "no"
                return f"SCORE: {score:.1f}\nFEEDBACK: Add more detail\nPASS: {passed}"
            return f"[v{self._call_count}] Generated output for: {content[:40]}"

    eo = EvaluatorOptimizer(
        generator=MockLLM("generator"),
        evaluator=MockLLM("evaluator"),
        criteria="Must be clear, accurate, and under 100 words.",
        threshold=0.8,
        max_iterations=3,
    )

    result = eo.run("Explain what a transformer neural network is")
    print(f"Passed:  {result.passed}")
    print(f"Iterations: {len(result.iterations)}")
    print(f"Final score: {result.final_score:.2f}")
    print(f"Output:\n{result.final_output}")
