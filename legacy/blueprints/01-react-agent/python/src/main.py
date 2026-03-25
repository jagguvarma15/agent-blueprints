"""
Entry point for the ReAct Agent blueprint.

Demonstrates the ReAct agent with several example queries that showcase:
1. Pure computation (calculator tool)
2. Time-based queries (get_current_time tool)
3. Information retrieval (web_search tool)
4. Multi-step reasoning (combining multiple tools)

Usage:
    uv run dev
    # or
    python src/main.py
"""

from __future__ import annotations

import logging
import os
import sys

from dotenv import load_dotenv

from src.agent import ReActAgent
from src.tools import TOOL_DEFINITIONS, calculator, get_current_time, web_search


def setup_logging(level: str = "INFO") -> None:
    """Configure logging for the application."""
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def create_agent(model: str, max_iterations: int) -> ReActAgent:
    """Create and configure a ReActAgent with all available tools."""
    agent = ReActAgent(
        model=model,
        tools=TOOL_DEFINITIONS,
        max_iterations=max_iterations,
    )
    # Register tool implementations
    agent.register_tool("calculator", calculator)
    agent.register_tool("get_current_time", get_current_time)
    agent.register_tool("web_search", web_search)
    return agent


def run_example(agent: ReActAgent, query: str, label: str) -> None:
    """Run a single example query and print the result."""
    print("\n" + "=" * 70)
    print(f"EXAMPLE: {label}")
    print("=" * 70)

    answer = agent.run(query)

    print("\n" + "-" * 60)
    print("FINAL ANSWER:")
    print(answer)
    print("=" * 70)


def main() -> None:
    """Main entry point."""
    # Load environment variables from .env file
    load_dotenv()

    # Configuration from environment
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print(
            "Error: ANTHROPIC_API_KEY environment variable not set.\n"
            "Copy .env.example to .env and add your API key.",
            file=sys.stderr,
        )
        sys.exit(1)

    model = os.environ.get("MODEL", "claude-opus-4-6")
    max_iterations = int(os.environ.get("MAX_ITERATIONS", "10"))
    log_level = os.environ.get("LOG_LEVEL", "WARNING")

    setup_logging(log_level)

    print("ReAct Agent Blueprint")
    print(f"Model: {model} | Max iterations: {max_iterations}")

    agent = create_agent(model=model, max_iterations=max_iterations)

    # Example 1: Pure math computation
    run_example(
        agent,
        query="What is the square root of the number of seconds in a week?",
        label="Math computation",
    )

    # Example 2: Current time query
    run_example(
        agent,
        query="What time is it right now in Tokyo and in New York?",
        label="Timezone query",
    )

    # Example 3: Multi-step computation
    run_example(
        agent,
        query=(
            "If I invest $10,000 at 7% annual compound interest, "
            "how much will I have after 20 years? "
            "Also, what is that as a multiple of the original investment?"
        ),
        label="Multi-step computation",
    )

    # Example 4: Search + compute
    run_example(
        agent,
        query=(
            "Search for information about the ReAct agent pattern, "
            "then give me a one-paragraph summary of what it is."
        ),
        label="Search and summarize",
    )

    print("\nAll examples complete.")


if __name__ == "__main__":
    main()
