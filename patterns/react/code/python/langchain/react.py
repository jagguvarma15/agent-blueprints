"""
ReAct — LangChain variant.

Pattern: ReAct (reason → act → observe loop with tools).
Framework: LangChain (>=0.3.0) with langchain-anthropic (>=0.2.0).
Idioms: create_tool_calling_agent() + AgentExecutor wraps the loop; @tool
  registers each callable with a Zod-style schema; max_iterations caps the
  ReAct turn count. AgentExecutor handles tool dispatch and termination.
Design doc: ../../../design.md (the framework-agnostic _reference.py at
  ../../_reference.py shows the loop control flow without a real LLM).

Install:  uv add langchain langchain-anthropic langchain-core
Run:      ANTHROPIC_API_KEY=... uv run --with 'langchain>=0.3,<0.4' \
              --with 'langchain-anthropic>=0.2' react.py

LangChain's 0.3.x agent surface is `create_tool_calling_agent` plus
`AgentExecutor` — the 0.2-and-earlier `initialize_agent` is gone. The
pattern is the same loop as the LangGraph sibling, but the framework owns
less state: there's no checkpointer, no message graph, just a model that
calls tools and an executor that runs them. Contrast with
../langgraph/react.py (state graph) and ../pydantic-ai/react.py (typed
result_type).
"""

from __future__ import annotations

import os
import sys

from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool

# AgentExecutor owns its own loop state, so this adapter doesn't bind a
# Python class to the canonical schema. The import documents the contract
# any recipe targeting ReAct still resolves against — ``Observation`` /
# ``ReActStep`` / ``ReActState`` — even when the framework hides the
# per-step shape behind ``intermediate_steps`` tuples.
from patterns.react.schemas.state import Observation, ReActState, ReActStep, ToolCall  # noqa: F401

_MOCK_DICTIONARY: dict[str, str] = {
    "recursion": "A method of solving a problem where the solution depends on solutions to smaller instances of the same problem.",
    "monad": "A design pattern in functional programming that wraps values to chain operations while handling side effects.",
    "agent": "An autonomous program that perceives its environment through inputs and acts on it through tools.",
}


@tool
def lookup_definition(word: str) -> str:
    """Return the canonical definition of `word` from the mock dictionary.

    Replace the dictionary body with a real lookup (REST call, DB query,
    etc.) when wiring. The tool contract — `(word: str) -> str` — stays
    the same.
    """
    return _MOCK_DICTIONARY.get(
        word.lower(),
        f"unknown: no entry for {word!r}",
    )


_SYSTEM_PROMPT = (
    "You are a dictionary agent. Given a word, call lookup_definition "
    "exactly once and then answer with the returned meaning. If the tool "
    "returns 'unknown', say so plainly instead of guessing."
)


def build_executor() -> AgentExecutor:
    """Wire the model + prompt + tools into an AgentExecutor.

    Factored out so tests can rebuild the executor with a stubbed model
    (e.g. langchain_core.language_models.fake_chat_models.FakeMessagesListChatModel).
    """
    llm = ChatAnthropic(model="claude-haiku-4-5", temperature=0)
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", _SYSTEM_PROMPT),
            ("placeholder", "{chat_history}"),
            ("human", "{input}"),
            ("placeholder", "{agent_scratchpad}"),
        ],
    )
    tools = [lookup_definition]
    agent = create_tool_calling_agent(llm, tools=tools, prompt=prompt)
    return AgentExecutor(
        agent=agent,
        tools=tools,
        max_iterations=4,
        handle_parsing_errors=True,
        return_intermediate_steps=True,
    )


def main() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the real loop.", file=sys.stderr)
        return

    executor = build_executor()
    result = executor.invoke({"input": "What does the word 'recursion' mean?"})
    print(f"answer: {result['output']}")
    steps = result.get("intermediate_steps", [])
    print(f"steps:  {len(steps)}")
    for i, (action, observation) in enumerate(steps, 1):
        print(f"  step {i}: tool={action.tool}  observation={str(observation)[:60]}")


if __name__ == "__main__":
    main()
