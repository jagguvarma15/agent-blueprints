"""
Multi-Agent — Supervisor delegates to specialized sub-agents.

A supervisor agent receives a task, decides which sub-agents to invoke
and in what order, collects their outputs, and synthesizes the final result.
Sub-agents are themselves autonomous (each can use tools, have memory, etc.).

Design doc:  ../../design.md
Overview:    ../../overview.md
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Callable, Protocol


# ── Interface ─────────────────────────────────────────────────────────────────

class LLM(Protocol):
    def generate(self, messages: list[dict]) -> str: ...


# ── Core types ────────────────────────────────────────────────────────────────

@dataclass
class SubAgent:
    name: str
    description: str                  # What this agent specializes in
    run: Callable[[str, str], str]    # fn(task, context) -> output


@dataclass
class Delegation:
    agent_name: str
    task: str
    context: str = ""


@dataclass
class AgentOutput:
    agent_name: str
    task: str
    output: str


@dataclass
class MultiAgentResult:
    final_output: str
    delegations: list[Delegation] = field(default_factory=list)
    agent_outputs: list[AgentOutput] = field(default_factory=list)


# ── Prompts ───────────────────────────────────────────────────────────────────

DELEGATE_PROMPT = """\
You are a supervisor agent. Decompose the following task and delegate
sub-tasks to the appropriate specialized agents.

Available agents:
{agents}

Task: {task}

Context from completed work so far:
{context}

Respond with a JSON array of delegations, or an empty array [] if the task
is now complete. Each delegation:
{{"agent": "<agent_name>", "task": "<specific sub-task to delegate>"}}

If work is complete, instead respond with:
{{"done": true, "reason": "<why the task is complete>"}}"""

SYNTHESIZE_PROMPT = """\
Synthesize the following agent outputs into a final result for the original task.

Original task: {task}

Agent outputs:
{outputs}

Produce the complete, unified final output."""


# ── Supervisor ────────────────────────────────────────────────────────────────

class MultiAgentSystem:
    """
    A supervisor that orchestrates multiple specialized sub-agents.

    The supervisor iteratively:
    1. Decides which agents to delegate to next
    2. Runs delegated tasks (sequentially by default; extend for parallel)
    3. Feeds outputs back as context
    4. Synthesizes the final result when done
    """

    def __init__(
        self,
        supervisor: LLM,
        agents: list[SubAgent],
        max_rounds: int = 5,
        shared_state: dict | None = None,
    ):
        self.supervisor = supervisor
        self.agents: dict[str, SubAgent] = {a.name: a for a in agents}
        self.max_rounds = max_rounds
        self.shared_state: dict = shared_state or {}

    def _decide(self, task: str, context: str) -> list[Delegation] | None:
        """Returns list of delegations, or None if done."""
        agent_list = "\n".join(
            f"- {a.name}: {a.description}" for a in self.agents.values()
        )
        messages = [{"role": "user", "content": DELEGATE_PROMPT.format(
            agents=agent_list, task=task, context=context or "None"
        )}]
        raw = self.supervisor.generate(messages)
        try:
            data = json.loads(raw)
            if isinstance(data, dict) and data.get("done"):
                return None  # Supervisor signals completion
            if isinstance(data, list):
                return [Delegation(agent_name=d["agent"], task=d["task"]) for d in data]
        except (json.JSONDecodeError, KeyError):
            pass
        return None

    def _delegate(self, delegation: Delegation, context: str) -> AgentOutput:
        agent = self.agents.get(delegation.agent_name)
        if not agent:
            output = f"Agent '{delegation.agent_name}' not found."
        else:
            output = agent.run(delegation.task, context)

        # Write to shared state so other agents can read it
        self.shared_state[delegation.agent_name] = output
        return AgentOutput(
            agent_name=delegation.agent_name,
            task=delegation.task,
            output=output,
        )

    def _synthesize(self, task: str, outputs: list[AgentOutput]) -> str:
        formatted = "\n\n".join(
            f"[{o.agent_name}]\nTask: {o.task}\nOutput: {o.output}"
            for o in outputs
        )
        messages = [{"role": "user", "content": SYNTHESIZE_PROMPT.format(
            task=task, outputs=formatted
        )}]
        return self.supervisor.generate(messages)

    def run(self, task: str) -> MultiAgentResult:
        all_delegations: list[Delegation] = []
        all_outputs: list[AgentOutput] = []
        context = ""

        for _ in range(self.max_rounds):
            delegations = self._decide(task, context)

            if delegations is None:  # Supervisor says done
                break

            if not delegations:
                break

            for delegation in delegations:
                output = self._delegate(delegation, context)
                all_delegations.append(delegation)
                all_outputs.append(output)
                context += f"\n[{output.agent_name}]: {output.output}"

        final = self._synthesize(task, all_outputs)
        return MultiAgentResult(
            final_output=final,
            delegations=all_delegations,
            agent_outputs=all_outputs,
        )


# ── Example ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":

    class MockLLM:
        def __init__(self):
            self._round = 0

        def generate(self, messages: list[dict]) -> str:
            self._round += 1
            content = messages[-1]["content"]
            if "Available agents" in content:
                if self._round <= 1:
                    return json.dumps([
                        {"agent": "researcher", "task": "Research current LLM agent frameworks"},
                        {"agent": "writer", "task": "Write a summary based on research"},
                    ])
                return json.dumps({"done": True, "reason": "All sub-tasks complete"})
            return f"[synthesized output from {len(messages)} messages]"

    def make_agent_fn(name: str) -> Callable[[str, str], str]:
        def fn(task: str, context: str) -> str:
            return f"[{name} output] Task: {task[:50]} | Context: {context[:30] or 'none'}"
        return fn

    system = MultiAgentSystem(
        supervisor=MockLLM(),
        agents=[
            SubAgent(
                name="researcher",
                description="Finds and summarizes factual information from sources",
                run=make_agent_fn("researcher"),
            ),
            SubAgent(
                name="writer",
                description="Writes clear, structured content based on provided research",
                run=make_agent_fn("writer"),
            ),
            SubAgent(
                name="reviewer",
                description="Reviews content for accuracy, clarity, and completeness",
                run=make_agent_fn("reviewer"),
            ),
        ],
        max_rounds=4,
    )

    result = system.run("Write a technical overview of LLM agent frameworks for a developer audience")
    print(f"Delegations: {len(result.delegations)}")
    for d in result.delegations:
        print(f"  → [{d.agent_name}] {d.task[:60]}")
    print(f"\nFinal output:\n{result.final_output}")
