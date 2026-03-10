from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable

import anthropic


@dataclass(frozen=True)
class PlanStep:
    id: int
    objective: str


class PlanExecuteAgent:
    """Plan-and-execute agent with explicit planning and step execution."""

    PLANNER_PROMPT = (
        "You are a planning assistant. Break the task into 2-6 concrete steps. "
        "Return ONLY valid JSON as an array of step objects: "
        "[{\"id\": 1, \"objective\": \"...\"}]"
    )

    EXECUTOR_PROMPT = (
        "You execute one plan step at a time. Use tools if needed. "
        "When done, return a concise step result."
    )

    SYNTHESIZER_PROMPT = (
        "You are a synthesis assistant. Combine step outputs into a direct final answer "
        "for the user."
    )

    def __init__(
        self,
        model: str,
        tools: list[dict[str, Any]],
        max_steps: int = 8,
        max_tool_rounds_per_step: int = 4,
        client: anthropic.Anthropic | None = None,
    ) -> None:
        self.model = model
        self.tools = tools
        self.max_steps = max_steps
        self.max_tool_rounds_per_step = max_tool_rounds_per_step
        self._client = client or anthropic.Anthropic()
        self._tool_registry: dict[str, Callable[..., str]] = {}

    def register_tool(self, name: str, fn: Callable[..., str]) -> None:
        self._tool_registry[name] = fn

    def run(self, query: str) -> str:
        plan = self._create_plan(query)
        if not plan:
            return "Unable to create a valid plan for this request."

        bounded_plan = plan[: self.max_steps]
        step_outputs: list[str] = []

        for step in bounded_plan:
            output = self._execute_step(query=query, step=step, prior_outputs=step_outputs)
            step_outputs.append(f"Step {step.id}: {output}")

        return self._synthesize(query=query, plan=bounded_plan, step_outputs=step_outputs)

    def _create_plan(self, query: str) -> list[PlanStep]:
        response = self._client.messages.create(
            model=self.model,
            max_tokens=1024,
            system=self.PLANNER_PROMPT,
            messages=[{"role": "user", "content": query}],
        )
        raw = self._extract_text(response.content)
        return self._parse_plan(raw)

    def _execute_step(self, query: str, step: PlanStep, prior_outputs: list[str]) -> str:
        context = "\n".join(prior_outputs) if prior_outputs else "No prior outputs yet."
        messages: list[dict[str, Any]] = [
            {
                "role": "user",
                "content": (
                    f"User query: {query}\n"
                    f"Current step ({step.id}): {step.objective}\n"
                    f"Prior step outputs:\n{context}"
                ),
            }
        ]

        for _ in range(self.max_tool_rounds_per_step):
            response = self._client.messages.create(
                model=self.model,
                max_tokens=2048,
                system=self.EXECUTOR_PROMPT,
                tools=self.tools,  # type: ignore[arg-type]
                messages=messages,  # type: ignore[arg-type]
            )

            messages.append({"role": "assistant", "content": response.content})

            if response.stop_reason == "end_turn":
                text = self._extract_text(response.content)
                return text or "Step completed with no textual output."

            if response.stop_reason == "tool_use":
                tool_results: list[dict[str, Any]] = []
                for block in response.content:
                    if block.type != "tool_use":
                        continue

                    tool_name = block.name
                    tool_input = getattr(block, "input", {}) or {}
                    result = self._call_tool(tool_name, tool_input)

                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": result,
                        }
                    )

                messages.append({"role": "user", "content": tool_results})
                continue

            return f"Step stopped unexpectedly with reason: {response.stop_reason}"

        return "Step terminated after max tool rounds without a final response."

    def _synthesize(self, query: str, plan: list[PlanStep], step_outputs: list[str]) -> str:
        plan_text = "\n".join(f"{step.id}. {step.objective}" for step in plan)
        outputs_text = "\n".join(step_outputs)

        response = self._client.messages.create(
            model=self.model,
            max_tokens=2048,
            system=self.SYNTHESIZER_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Original query: {query}\n\n"
                        f"Plan:\n{plan_text}\n\n"
                        f"Step outputs:\n{outputs_text}\n\n"
                        "Return the final answer only."
                    ),
                }
            ],
        )
        final = self._extract_text(response.content)
        return final or "Unable to synthesize a final answer."

    def _call_tool(self, tool_name: str, tool_input: dict[str, Any]) -> str:
        fn = self._tool_registry.get(tool_name)
        if fn is None:
            return f"Error: Unknown tool {tool_name!r}."
        try:
            result = fn(**tool_input)
            return result if isinstance(result, str) else json.dumps(result)
        except TypeError as exc:
            return f"Error: Invalid arguments for tool {tool_name!r}: {exc}"
        except Exception as exc:
            return f"Error: Tool {tool_name!r} failed with: {exc}"

    @staticmethod
    def _extract_text(content: list[Any]) -> str:
        parts: list[str] = []
        for block in content:
            if getattr(block, "type", None) == "text":
                parts.append(getattr(block, "text", ""))
        return "\n".join(parts).strip()

    @staticmethod
    def _parse_plan(raw: str) -> list[PlanStep]:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return []

        if not isinstance(parsed, list):
            return []

        steps: list[PlanStep] = []
        for index, item in enumerate(parsed, 1):
            if not isinstance(item, dict):
                continue
            objective = item.get("objective")
            step_id = item.get("id", index)
            if not isinstance(objective, str) or not objective.strip():
                continue
            if not isinstance(step_id, int):
                step_id = index
            steps.append(PlanStep(id=step_id, objective=objective.strip()))
        return steps
