"""
Multi-Agent — CrewAI variant (purpose-built crew of role peers).

Pattern: Three role-specialized agents collaborate on a single task. The
  crew structure handles delegation; we don't roll our own supervisor.
Framework: CrewAI (>=0.70.0).
Idioms: one `Agent` per role with role / goal / backstory; sequential
  `Task` chain (researcher → writer → reviewer); `Crew` orchestrates with
  `Process.sequential` so each task receives the previous task's output.
Design doc: ../../../design.md (the framework-agnostic ../../python/multi_agent.py
  runs the same researcher → writer → reviewer flow with a hand-rolled
  supervisor loop).

Install:  uv add 'crewai>=0.70.0' 'crewai[tools]'
Run:      ANTHROPIC_API_KEY=... uv run --with 'crewai>=0.70.0' multi_agent.py

CrewAI's strength is exactly this shape: a flat crew of role peers passing
work down a sequential chain. The supervisor abstraction the LangGraph
sibling at ../langgraph/multi_agent.py rolls by hand is replaced by the
Crew + Task graph here — fewer moving parts, less code. Reach for
LangGraph when the orchestration needs branching, parallel fan-out, or
durable checkpointed state.
"""

from __future__ import annotations

import os
import sys

from crewai import Agent, Crew, Process, Task

_MODEL = "anthropic/claude-haiku-4-5"


def build_crew(task_description: str) -> Crew:
    """Wire three role-specialized agents into a sequential crew.

    Factored so tests can swap the LLM via the `llm` kwarg on each Agent.
    """
    researcher = Agent(
        role="researcher",
        goal="Find and summarize factual information from sources",
        backstory="You are a careful researcher who only states what you can verify.",
        llm=_MODEL,
        allow_delegation=False,
        verbose=False,
    )
    writer = Agent(
        role="writer",
        goal="Write clear, structured content based on the researcher's findings",
        backstory="You are a technical writer who turns research notes into readable prose.",
        llm=_MODEL,
        allow_delegation=False,
        verbose=False,
    )
    reviewer = Agent(
        role="reviewer",
        goal="Review content for accuracy, clarity, and completeness",
        backstory="You are a strict reviewer who flags claims that aren't supported by the research.",
        llm=_MODEL,
        allow_delegation=False,
        verbose=False,
    )

    research_task = Task(
        description=task_description,
        expected_output="A short research brief — 5-8 bullet points of factual findings.",
        agent=researcher,
    )
    write_task = Task(
        description=(
            "Using the researcher's findings, write a developer-audience overview "
            "of the task. Cite the findings inline."
        ),
        expected_output="A 200-400 word overview with inline citations.",
        agent=writer,
        context=[research_task],
    )
    review_task = Task(
        description=(
            "Review the writer's overview for accuracy and clarity. "
            "Return either 'APPROVED' or a short list of required revisions."
        ),
        expected_output="One line starting with APPROVED or REVISE, followed by reasoning.",
        agent=reviewer,
        context=[write_task],
    )

    return Crew(
        agents=[researcher, writer, reviewer],
        tasks=[research_task, write_task, review_task],
        process=Process.sequential,
        verbose=False,
    )


def main() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the real crew.", file=sys.stderr)
        return

    crew = build_crew(
        "Write a technical overview of LLM agent frameworks for a developer audience.",
    )
    result = crew.kickoff()
    print("Crew finished.")
    print(f"Final output:\n{str(result)[:400]}")


if __name__ == "__main__":
    main()
