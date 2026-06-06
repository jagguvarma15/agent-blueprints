"""
ReAct — Pydantic AI variant.

Pattern: ReAct (reason → act → observe loop with tools).
Framework: Pydantic AI (>=0.1.0).
Idioms: typed Agent with result_type; @agent.tool for tool registration;
  agent.run_sync() drives the ReAct loop internally (Pydantic AI implements
  the loop for you — you supply tools + system prompt + result schema).
Design doc: ../../../design.md (the framework-agnostic _reference.py at
  ../../_reference.py shows the loop control flow without a real LLM).

Install:  uv add pydantic-ai[anthropic]
Run:      ANTHROPIC_API_KEY=... uv run --with pydantic-ai react.py

The framework primitive in Pydantic AI ('Agent') is a ReAct loop. You
register tools, declare the result schema, and the framework handles
reasoning, tool dispatch, and termination. Contrast with the LangGraph
sibling at ../langgraph/react.py, which builds the same loop as an
explicit state graph.
"""

from __future__ import annotations

import os
import sys
from typing import Annotated

from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext

# Pydantic AI's Agent owns the ReAct loop internally; this adapter binds
# its result_type to a domain ``Definition`` rather than the canonical
# step-trail. The import documents the contract recipes targeting ReAct
# still resolve against.
from patterns.react.schemas.state import Observation, ReActState, ReActStep, ToolCall  # noqa: F401


class Definition(BaseModel):
    """Result type — Pydantic AI validates the LLM's output against this."""

    word: str = Field(description="The word that was looked up.")
    meaning: str = Field(description="A concise definition, 1-2 sentences.")
    sources_consulted: list[str] = Field(
        default_factory=list,
        description="Tool names used to produce the definition.",
    )


# Mock dictionary so the smoke test runs without external services. A real
# implementation would back this with WordNet, a dictionary API, or RAG.
_MOCK_DICTIONARY: dict[str, str] = {
    "recursion": "A method of solving a problem where the solution depends on solutions to smaller instances of the same problem.",
    "monad": "A design pattern in functional programming that wraps values to chain operations while handling side effects.",
    "agent": "An autonomous program that perceives its environment through inputs and acts on it through tools.",
}


SYSTEM_PROMPT = (
    "You are a dictionary agent. Given a word, call the lookup_definition "
    "tool exactly once, then return a Definition. Do not guess if the tool "
    "returns 'unknown'."
)


def build_agent() -> Agent[None, Definition]:
    """Construct the Pydantic AI agent.

    Wrapped in a function so importing this module doesn't fail when no
    ANTHROPIC_API_KEY is set — the Anthropic provider validates the key
    at construction time.
    """
    agent: Agent[None, Definition] = Agent(
        "anthropic:claude-haiku-4-5",
        result_type=Definition,
        system_prompt=SYSTEM_PROMPT,
    )

    @agent.tool
    def lookup_definition(
        ctx: RunContext[None],
        word: Annotated[str, "The word to look up."],
    ) -> str:
        """Return the canonical definition of ``word`` from the mock dictionary."""
        return _MOCK_DICTIONARY.get(word.lower(), f"unknown: no entry for {word!r}")

    return agent


def main() -> int:
    if "ANTHROPIC_API_KEY" not in os.environ:
        print("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the real loop.")
        return 0

    agent = build_agent()
    result = agent.run_sync("What does the word 'recursion' mean?")
    definition = result.output
    print(f"word:    {definition.word}")
    print(f"meaning: {definition.meaning}")
    print(f"sources: {definition.sources_consulted}")
    print(f"\n(loop took {len(result.all_messages())} messages)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
