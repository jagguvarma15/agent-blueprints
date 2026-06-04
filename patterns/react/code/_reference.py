"""
ReAct Agent — Reason + Act loop with tools.

The LLM alternates between thinking (reasoning) and acting (calling a tool).
Each tool observation is fed back into the loop until the agent decides
it has enough information to produce a final answer.

Design doc:  ../../design.md
Overview:    ../../overview.md
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable, Protocol


# ── Interfaces ────────────────────────────────────────────────────────────────

class LLM(Protocol):
    def generate(self, messages: list[dict]) -> str: ...


# ── Core types ────────────────────────────────────────────────────────────────

@dataclass
class Tool:
    name: str
    description: str
    fn: Callable[..., str]          # Returns a string observation

    def run(self, input: str) -> str:
        return self.fn(input)


@dataclass
class Step:
    thought: str
    action: str | None              # None means final answer
    action_input: str | None
    observation: str | None


@dataclass
class AgentResult:
    answer: str
    steps: list[Step] = field(default_factory=list)
    stopped_by_guard: bool = False


# ── Implementation ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are an agent that uses tools to answer questions.

Available tools:
{tool_descriptions}

For each step, respond in this exact format:
Thought: <your reasoning about what to do next>
Action: <tool_name>
Action Input: <input for the tool>

When you have enough information to answer, respond with:
Thought: I now know the final answer.
Final Answer: <your complete response>

Begin."""


class ReActAgent:
    """
    Implements the Reason + Act loop.

    The agent loops: think → call tool → observe result → repeat.
    Terminates when the LLM outputs "Final Answer:" or max_steps is reached.
    """

    def __init__(
        self,
        llm: LLM,
        tools: list[Tool],
        max_steps: int = 10,
        system_prompt: str = SYSTEM_PROMPT,
    ):
        self.llm = llm
        self.tools: dict[str, Tool] = {t.name: t for t in tools}
        self.max_steps = max_steps
        self.system_prompt = system_prompt

    def _build_system(self) -> str:
        tool_descriptions = "\n".join(
            f"- {t.name}: {t.description}" for t in self.tools.values()
        )
        return self.system_prompt.format(tool_descriptions=tool_descriptions)

    def _parse_response(self, text: str) -> tuple[str, str | None, str | None, str | None]:
        """Returns (thought, action, action_input, final_answer)."""
        thought = ""
        action = action_input = final_answer = None

        if m := re.search(r"Thought:\s*(.+?)(?=\n(?:Action|Final Answer)|$)", text, re.S):
            thought = m.group(1).strip()
        if m := re.search(r"Action:\s*(.+)", text):
            action = m.group(1).strip()
        if m := re.search(r"Action Input:\s*(.+?)(?=\n|$)", text, re.S):
            action_input = m.group(1).strip()
        if m := re.search(r"Final Answer:\s*(.+?)(?=$)", text, re.S):
            final_answer = m.group(1).strip()

        return thought, action, action_input, final_answer

    def run(self, task: str) -> AgentResult:
        messages: list[dict] = [
            {"role": "system", "content": self._build_system()},
            {"role": "user", "content": task},
        ]
        steps: list[Step] = []

        for _ in range(self.max_steps):
            response = self.llm.generate(messages)
            thought, action, action_input, final_answer = self._parse_response(response)

            if final_answer is not None:
                steps.append(Step(thought=thought, action=None, action_input=None, observation=None))
                return AgentResult(answer=final_answer, steps=steps)

            # Execute tool
            observation = "Tool not found."
            if action and action in self.tools:
                try:
                    observation = self.tools[action].run(action_input or "")
                except Exception as exc:
                    observation = f"Error: {exc}"

            steps.append(Step(
                thought=thought,
                action=action,
                action_input=action_input,
                observation=observation,
            ))

            # Append assistant turn + observation to history
            messages.append({"role": "assistant", "content": response})
            messages.append({"role": "user", "content": f"Observation: {observation}"})

        return AgentResult(
            answer="Reached maximum steps without a final answer.",
            steps=steps,
            stopped_by_guard=True,
        )


# ── Example ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":

    class MockLLM:
        def __init__(self):
            self._calls = 0

        def generate(self, messages: list[dict]) -> str:
            self._calls += 1
            if self._calls == 1:
                return "Thought: I should search for this.\nAction: search\nAction Input: ReAct paper"
            return "Thought: I now know the final answer.\nFinal Answer: ReAct is a prompting technique that combines reasoning and acting in language models."

    agent = ReActAgent(
        llm=MockLLM(),
        tools=[
            Tool(
                name="search",
                description="Search the web for information",
                fn=lambda q: f"Search results for '{q}': [ReAct: Synergizing Reasoning and Acting in Language Models, Yao et al. 2022]",
            ),
            Tool(
                name="calculator",
                description="Evaluate a math expression",
                fn=lambda expr: str(eval(expr)),  # noqa: S307
            ),
        ],
        max_steps=5,
    )

    result = agent.run("What is the ReAct prompting technique?")
    print(f"Steps taken: {len(result.steps)}")
    for i, step in enumerate(result.steps, 1):
        print(f"  Step {i}: {step.thought[:60]}")
        if step.action:
            print(f"    → {step.action}({step.action_input})")
            print(f"    ← {step.observation}")
    print(f"\nAnswer: {result.answer}")
