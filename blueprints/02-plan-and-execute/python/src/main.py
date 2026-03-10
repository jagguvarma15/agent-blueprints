from __future__ import annotations

import os
import sys

from dotenv import load_dotenv

from src.agent import PlanExecuteAgent
from src.tools import TOOL_DEFINITIONS, calculator, get_current_time, web_search


def create_agent(model: str) -> PlanExecuteAgent:
    agent = PlanExecuteAgent(model=model, tools=TOOL_DEFINITIONS)
    agent.register_tool("calculator", calculator)
    agent.register_tool("get_current_time", get_current_time)
    agent.register_tool("web_search", web_search)
    return agent


def main() -> None:
    load_dotenv()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print(
            "Error: ANTHROPIC_API_KEY environment variable not set.\n"
            "Copy .env.example to .env and add your API key.",
            file=sys.stderr,
        )
        sys.exit(1)

    model = os.environ.get("MODEL", "claude-opus-4-6")
    agent = create_agent(model)

    query = (
        "Research the top three causes of latency in LLM applications and provide "
        "a practical optimization checklist."
    )
    print("Plan-and-Execute Agent Blueprint")
    print(f"Model: {model}")
    print("-" * 70)
    print(f"Query: {query}\n")

    answer = agent.run(query)
    print("Final answer:\n")
    print(answer)


if __name__ == "__main__":
    main()
