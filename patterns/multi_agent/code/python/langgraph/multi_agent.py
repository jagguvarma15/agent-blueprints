"""
Multi-Agent — LangGraph variant (supervisor pattern).

Pattern: Supervisor agent delegates to specialized sub-agents and
  synthesizes their outputs.
Framework: LangGraph (>=0.3.21) with langchain-anthropic for the model.
Idioms: a TypedDict state carrying the task + delegation log + per-agent
  outputs; each sub-agent is a node that reads its assigned task off state
  and writes its output back; the supervisor node uses structured output
  (via PydanticOutputParser) to pick the next sub-agent each round. A
  conditional edge from supervisor → {researcher, writer, reviewer, END}
  drives the loop.
Design doc: ../../../design.md (the framework-agnostic ../../python/multi_agent.py
  runs the same researcher → writer → reviewer delegation).

Install:  uv add langgraph langchain-anthropic langchain-core
Run:      ANTHROPIC_API_KEY=... uv run --with langgraph \
              --with langchain-anthropic multi_agent.py

The LangGraph primitive is the conditional-edge supervisor: the
supervisor node returns a routing decision, the graph's conditional
edge dispatches to the named sub-agent node, which returns to supervisor.
This is the explicit hand-rolled supervisor — the `langgraph-supervisor`
package wraps the same shape. Contrast with ../crewai/multi_agent.py
where the supervisor / role abstractions are framework primitives.
"""

from __future__ import annotations

import os
import sys
from typing import Literal, TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

# Canonical contract imports — the LangGraph nodes below operate on a
# framework-flavoured TypedDict (``GraphState``) and a constrained
# routing decision (``RouteToAgent``), but recipes targeting Multi-Agent
# bind to the names below, so the file references the canonical shape.
from patterns.multi_agent.schemas.state import (  # noqa: F401
    AgentResult,
    MultiAgentState,
    SupervisorDecision,
)

_MAX_ROUNDS = 4


class RouteToAgent(BaseModel):
    """LangGraph-specific routing primitive.

    Constrained ``next`` to a Literal so the graph's conditional edge can
    dispatch directly. The canonical :class:`SupervisorDecision` carries
    the same idea with an unconstrained ``next_agent`` string; recipes
    bind to the canonical form, this adapter narrows it for the graph.
    """

    next: Literal["researcher", "writer", "reviewer", "done"] = Field(
        description="Sub-agent to invoke next, or 'done' when the task is complete.",
    )
    sub_task: str = Field(default="", description="Sub-task description for the chosen agent.")


class GraphState(TypedDict):
    """LangGraph TypedDict mirroring the canonical :class:`MultiAgentState`.

    Field names map cleanly: ``task → user_goal``, ``delegations →
    agent_results``, ``final_output → final_answer``, ``rounds`` stays.
    The TypedDict shape is required by LangGraph's state-graph reducer;
    the canonical Pydantic model is what recipes serialize.
    """

    task: str
    delegations: list[dict]
    rounds: int
    final_output: str


def _model() -> ChatAnthropic:
    return ChatAnthropic(model="claude-haiku-4-5", temperature=0)


def _run_sub_agent(name: str, instructions: str, sub_task: str) -> str:
    response = _model().invoke(
        [SystemMessage(content=instructions), HumanMessage(content=sub_task)],
    )
    return f"[{name}] {response.content}".strip()


def researcher(state: GraphState) -> GraphState:
    last = state["delegations"][-1] if state["delegations"] else {"sub_task": state["task"]}
    output = _run_sub_agent(
        "researcher",
        "You find and summarize factual information from sources. Be concise.",
        last["sub_task"],
    )
    return {
        **state,
        "delegations": [*state["delegations"], {"agent": "researcher", "sub_task": last["sub_task"], "output": output}],
    }


def writer(state: GraphState) -> GraphState:
    last = state["delegations"][-1] if state["delegations"] else {"sub_task": state["task"]}
    output = _run_sub_agent(
        "writer",
        "You write clear, structured content based on provided research.",
        last["sub_task"],
    )
    return {
        **state,
        "delegations": [*state["delegations"], {"agent": "writer", "sub_task": last["sub_task"], "output": output}],
    }


def reviewer(state: GraphState) -> GraphState:
    last = state["delegations"][-1] if state["delegations"] else {"sub_task": state["task"]}
    output = _run_sub_agent(
        "reviewer",
        "You review content for accuracy, clarity, and completeness. Return a short verdict.",
        last["sub_task"],
    )
    return {
        **state,
        "delegations": [*state["delegations"], {"agent": "reviewer", "sub_task": last["sub_task"], "output": output}],
    }


def supervisor(state: GraphState) -> GraphState:
    if state["rounds"] >= _MAX_ROUNDS:
        return {**state, "final_output": "Reached max rounds.", "rounds": state["rounds"] + 1}
    structured = _model().with_structured_output(RouteToAgent)
    log = "\n".join(f"[{d['agent']}] {d['output'][:100]}" for d in state["delegations"]) or "(none)"
    decision = structured.invoke(
        [
            SystemMessage(
                content=(
                    "You supervise a multi-agent system. Each round, decide which sub-agent "
                    "to invoke next, or return 'done' when the task is complete.\n"
                    "Available agents: researcher, writer, reviewer."
                ),
            ),
            HumanMessage(content=f"Task: {state['task']}\n\nDelegations so far:\n{log}\n\nDecide next."),
        ],
    )
    if decision.next == "done":
        synthesis = _model().invoke(
            [
                SystemMessage(content="Synthesize the final answer from the sub-agents' outputs."),
                HumanMessage(content=f"Task: {state['task']}\n\nDelegations:\n{log}"),
            ],
        )
        return {**state, "final_output": str(synthesis.content), "rounds": state["rounds"] + 1}
    return {
        **state,
        "delegations": [
            *state["delegations"],
            {"agent": decision.next, "sub_task": decision.sub_task, "output": "<pending>"},
        ],
        "rounds": state["rounds"] + 1,
    }


def _route(state: GraphState) -> str:
    if state["final_output"]:
        return END
    last = state["delegations"][-1] if state["delegations"] else None
    if last and last["output"] == "<pending>":
        return last["agent"]
    return END


def build_graph() -> object:
    g = StateGraph(GraphState)
    g.add_node("supervisor", supervisor)
    g.add_node("researcher", researcher)
    g.add_node("writer", writer)
    g.add_node("reviewer", reviewer)
    g.add_edge(START, "supervisor")
    g.add_conditional_edges(
        "supervisor", _route, {"researcher": "researcher", "writer": "writer", "reviewer": "reviewer", END: END}
    )
    g.add_edge("researcher", "supervisor")
    g.add_edge("writer", "supervisor")
    g.add_edge("reviewer", "supervisor")
    return g.compile()


def main() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the real supervisor loop.", file=sys.stderr)
        return

    compiled = build_graph()
    final_state: GraphState = compiled.invoke(  # type: ignore[assignment, attr-defined]
        {
            "task": "Write a technical overview of LLM agent frameworks for a developer audience",
            "delegations": [],
            "rounds": 0,
            "final_output": "",
        },
    )
    print(f"Delegations: {len(final_state['delegations'])}")
    for d in final_state["delegations"]:
        print(f"  -> [{d['agent']}] {d['sub_task'][:60]}")
    print(f"\nFinal output:\n{final_state['final_output'][:200]}")


if __name__ == "__main__":
    main()
