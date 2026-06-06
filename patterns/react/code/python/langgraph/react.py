"""
ReAct — LangGraph variant.

Pattern: ReAct (reason → act → observe loop with tools).
Framework: LangGraph (>=0.3.21) with langchain-anthropic for the model.
Idioms: create_react_agent() prebuilt from langgraph.prebuilt wraps the
  agent loop; tools are plain Python callables registered with the agent;
  LangGraph handles state, tool dispatch, and termination.
Design doc: ../../../design.md (the framework-agnostic _reference.py at
  ../../_reference.py shows the loop control flow without a real LLM).

Install:  uv add langgraph langchain-anthropic
Run:      ANTHROPIC_API_KEY=... uv run --with langgraph --with langchain-anthropic react.py

LangGraph's create_react_agent ships a pre-built ReAct loop. You supply a
model and a list of tools; the framework wires up the message graph
(model → tool → model → …) and emits a final AIMessage when the agent
stops. Contrast with the Pydantic AI sibling at ../pydantic-ai/react.py
where the loop is implicit inside agent.run_sync().
"""

from __future__ import annotations

import os
import sys

from langchain_anthropic import ChatAnthropic
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

# The prebuilt React agent owns its own message-graph state shape, so
# this adapter doesn't construct an explicit ``ReActState``. The import
# anchors the contract — recipes targeting ReAct still bind against
# ``Observation`` / ``ReActStep`` / ``ReActState`` even when the
# framework hides them.
from patterns.react.schemas.state import Observation, ReActState, ReActStep, ToolCall  # noqa: F401

_MOCK_DICTIONARY: dict[str, str] = {
    "recursion": "A method of solving a problem where the solution depends on solutions to smaller instances of the same problem.",
    "monad": "A design pattern in functional programming that wraps values to chain operations while handling side effects.",
    "agent": "An autonomous program that perceives its environment through inputs and acts on it through tools.",
}


@tool
def lookup_definition(word: str) -> str:
    """Return the canonical definition of ``word`` from the mock dictionary.

    Use this exactly once per question; do not guess if it returns 'unknown'.
    """
    return _MOCK_DICTIONARY.get(word.lower(), f"unknown: no entry for {word!r}")


SYSTEM_PROMPT = (
    "You are a dictionary agent. Given a word, call lookup_definition exactly "
    "once and then answer with the returned meaning. If the tool returns "
    "'unknown', say so plainly instead of guessing."
)


def build_agent():  # type: ignore[no-untyped-def]
    """Construct the prebuilt ReAct agent.

    Wrapped in a function so the import of ChatAnthropic doesn't trigger
    config validation at module import (handy for tests that import this
    module without an API key).
    """
    model = ChatAnthropic(model_name="claude-haiku-4-5", timeout=60, stop=None)
    return create_react_agent(model, tools=[lookup_definition], prompt=SYSTEM_PROMPT)


def main() -> int:
    if "ANTHROPIC_API_KEY" not in os.environ:
        print("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the real loop.")
        return 0

    agent = build_agent()
    result = agent.invoke({"messages": [("user", "What does the word 'recursion' mean?")]})
    final = result["messages"][-1]
    print(f"answer:   {final.content}")
    print(f"(loop produced {len(result['messages'])} messages)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
