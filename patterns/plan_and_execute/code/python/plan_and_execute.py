"""
Plan & Execute — Create a full plan upfront, then execute each step.

Separates planning from execution: the planner LLM produces an ordered
step list before any execution begins. An executor then runs each step,
optionally replanning if a step fails or produces unexpected results.

Design doc:  ../../design.md
Overview:    ../../overview.md
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Callable, Protocol


# ── Interfaces ────────────────────────────────────────────────────────────────

class LLM(Protocol):
    def generate(self, messages: list[dict]) -> str: ...


# ── Core types ────────────────────────────────────────────────────────────────

@dataclass
class PlanStep:
    index: int
    description: str
    tool: str | None = None         # Optional tool name for this step
    output: str | None = None
    status: str = "pending"         # "pending" | "done" | "failed"


@dataclass
class ExecutionResult:
    final_output: str
    plan: list[PlanStep] = field(default_factory=list)
    replanned: bool = False


# ── Implementation ────────────────────────────────────────────────────────────

PLAN_PROMPT = """\
You are a planning agent. Create a step-by-step plan to accomplish the task below.

Available tools: {tools}

Task: {task}

Respond with a JSON array of steps. Each step has:
- "step": step number (integer)
- "description": what to do
- "tool": tool name to use, or null if it's an LLM reasoning step

Example:
[
  {{"step": 1, "description": "Search for recent data on X", "tool": "search"}},
  {{"step": 2, "description": "Summarize findings", "tool": null}}
]

Return only the JSON array."""

EXECUTE_PROMPT = """\
You are an execution agent completing one step of a plan.

Original task: {task}
Current step: {step}

Context from previous steps:
{context}

Complete this step and return only the result."""

REPLAN_PROMPT = """\
A step in your plan failed. Revise the remaining steps.

Original task: {task}
Completed steps: {completed}
Failed step: {failed_step}
Failure reason: {reason}
Remaining steps (to revise): {remaining}

Return a revised JSON array for the remaining steps only."""


class PlanAndExecute:
    """
    Plans all steps upfront, then executes them sequentially.
    Replans automatically when a step fails (optional).
    """

    def __init__(
        self,
        planner: LLM,
        executor: LLM,
        tools: dict[str, Callable[[str], str]] | None = None,
        replan_on_failure: bool = True,
        max_replan_attempts: int = 2,
    ):
        self.planner = planner
        self.executor = executor
        self.tools = tools or {}
        self.replan_on_failure = replan_on_failure
        self.max_replan_attempts = max_replan_attempts

    def _plan(self, task: str, remaining_steps: list[PlanStep] | None = None) -> list[PlanStep]:
        tool_list = ", ".join(self.tools.keys()) if self.tools else "none"
        messages = [{"role": "user", "content": PLAN_PROMPT.format(
            task=task, tools=tool_list
        )}]
        raw = self.planner.generate(messages)
        try:
            items = json.loads(raw)
            return [PlanStep(index=i["step"], description=i["description"], tool=i.get("tool"))
                    for i in items]
        except (json.JSONDecodeError, KeyError):
            return [PlanStep(index=1, description=task, tool=None)]

    def _execute_step(self, task: str, step: PlanStep, context: str) -> str:
        if step.tool and step.tool in self.tools:
            return self.tools[step.tool](step.description)

        messages = [{"role": "user", "content": EXECUTE_PROMPT.format(
            task=task, step=step.description, context=context or "None"
        )}]
        return self.executor.generate(messages)

    def run(self, task: str) -> ExecutionResult:
        steps = self._plan(task)
        context_parts: list[str] = []
        replanned = False
        replan_count = 0

        i = 0
        while i < len(steps):
            step = steps[i]
            step.status = "pending"
            context = "\n".join(context_parts) or "None"

            try:
                output = self._execute_step(task, step, context)
                step.output = output
                step.status = "done"
                context_parts.append(f"Step {step.index}: {output}")
                i += 1
            except Exception as exc:
                step.status = "failed"
                if self.replan_on_failure and replan_count < self.max_replan_attempts:
                    # Replan remaining steps
                    completed = [s for s in steps if s.status == "done"]
                    remaining = steps[i + 1:]
                    messages = [{"role": "user", "content": REPLAN_PROMPT.format(
                        task=task,
                        completed="\n".join(f"- {s.description}" for s in completed),
                        failed_step=step.description,
                        reason=str(exc),
                        remaining="\n".join(f"- {s.description}" for s in remaining),
                    )}]
                    raw = self.planner.generate(messages)
                    try:
                        new_steps = [PlanStep(index=j["step"], description=j["description"],
                                              tool=j.get("tool"))
                                     for j in json.loads(raw)]
                        steps = steps[:i] + new_steps
                        replanned = True
                        replan_count += 1
                        i += 1  # Skip the failed step
                    except (json.JSONDecodeError, KeyError):
                        break
                else:
                    break

        final = context_parts[-1] if context_parts else "No output produced."
        return ExecutionResult(final_output=final, plan=steps, replanned=replanned)


# ── Example ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":

    class MockLLM:
        def __init__(self, name: str):
            self.name = name

        def generate(self, messages: list[dict]) -> str:
            content = messages[-1]["content"]
            if "JSON array" in content:
                return json.dumps([
                    {"step": 1, "description": "Research the topic", "tool": "search"},
                    {"step": 2, "description": "Analyze the findings", "tool": None},
                    {"step": 3, "description": "Write the final report", "tool": None},
                ])
            return f"[{self.name} output for: {content[:50]}]"

    agent = PlanAndExecute(
        planner=MockLLM("planner"),
        executor=MockLLM("executor"),
        tools={"search": lambda q: f"Search results: top 3 articles about '{q}'"},
    )

    result = agent.run("Write a report on the adoption of LLM agents in enterprise software")
    print(f"Steps planned: {len(result.plan)}")
    for step in result.plan:
        print(f"  [{step.status}] Step {step.index}: {step.description}")
    print(f"\nFinal output:\n{result.final_output}")
