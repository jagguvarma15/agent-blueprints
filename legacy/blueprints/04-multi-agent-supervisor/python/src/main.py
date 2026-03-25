"""
Entry point for Blueprint 04: Multi-Agent Supervisor.

Demonstrates the supervisor routing three different task types to the
appropriate specialised worker agents and synthesising a final response.

Usage:
    uv run python src/main.py
"""

from __future__ import annotations

import logging
import os
import sys
import textwrap

from dotenv import load_dotenv

# Load .env before importing agents/supervisor so ANTHROPIC_API_KEY is available.
load_dotenv()

from .supervisor import SupervisorAgent  # noqa: E402

# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Demo tasks
# ---------------------------------------------------------------------------

DEMO_TASKS = [
    # Task 1: research only
    (
        "research",
        "What are the three most impactful recent breakthroughs in large language "
        "model research? Give me a concise bullet-point summary.",
    ),
    # Task 2: code only
    (
        "code",
        "Write a Python function that implements binary search on a sorted list. "
        "Include type hints, a docstring, and an example usage.",
    ),
    # Task 3: multi-domain (research + writing + code)
    (
        "multi-domain",
        "Research the main advantages of async programming in Python, then write "
        "a short technical blog post (around 300 words) that explains those "
        "advantages with a concrete asyncio code example.",
    ),
]


def separator(title: str, width: int = 72) -> None:
    print(f"\n{'=' * width}")
    print(f"  {title}")
    print(f"{'=' * width}\n")


def run_demo() -> None:
    """Run the supervisor on each demo task and pretty-print the results."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit(
            "ERROR: ANTHROPIC_API_KEY is not set. "
            "Copy .env.example to .env and add your key."
        )

    supervisor = SupervisorAgent()
    separator("Blueprint 04 — Multi-Agent Supervisor Demo")

    for label, task in DEMO_TASKS:
        separator(f"Task [{label}]")
        print(textwrap.fill(f"TASK: {task}", width=72))
        print()

        try:
            result = supervisor.run(task)
            print("RESULT:")
            print(result)
        except Exception as exc:  # noqa: BLE001
            logger.error("Task '%s' failed: %s", label, exc, exc_info=True)

    separator("Demo complete")


if __name__ == "__main__":
    run_demo()
