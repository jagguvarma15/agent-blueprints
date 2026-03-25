"""
Worker agent implementations for Blueprint 04: Multi-Agent Supervisor.

Each agent is a self-contained Anthropic API client with a domain-specific
system prompt. Agents are stateless — every call to ``run()`` starts a fresh
conversation — which keeps them simple and easy to test in isolation.
"""

from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod

import anthropic
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Base class
# ---------------------------------------------------------------------------


class BaseAgent(ABC):
    """Abstract base class for all worker agents."""

    #: Unique snake_case identifier used as the tool name in the supervisor.
    name: str
    #: Human-readable description shown to the supervisor LLM so it can
    #: decide when to route a task to this agent.
    description: str

    def __init__(self) -> None:
        self._client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        self._model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")

    @abstractmethod
    def run(self, task: str) -> str:
        """Execute the task and return the result as a string.

        Args:
            task: Natural language description of what the agent should do.

        Returns:
            The agent's response as a plain string (may contain Markdown).
        """

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    def _call_api(self, system: str, user_message: str) -> str:
        """Make a single-turn API call with retry logic.

        Args:
            system: System prompt that configures the agent's behaviour.
            user_message: The user-turn message (the task).

        Returns:
            The model's text response.
        """
        logger.debug("[%s] calling API with task: %.80s…", self.name, user_message)
        response = self._client.messages.create(
            model=self._model,
            max_tokens=2048,
            system=system,
            messages=[{"role": "user", "content": user_message}],
        )
        text = next(
            (block.text for block in response.content if block.type == "text"),
            "",
        )
        logger.debug("[%s] response length: %d chars", self.name, len(text))
        return text


# ---------------------------------------------------------------------------
# ResearchAgent
# ---------------------------------------------------------------------------

_RESEARCH_SYSTEM = """\
You are an expert research assistant. Your job is to gather information, \
find facts, and produce clear, well-organised research summaries.

Guidelines:
- Be thorough and accurate. Cite hypothetical sources where relevant \
  (e.g. "According to [Nature, 2024]…").
- Prefer bullet points and short paragraphs for scannability.
- When you are uncertain, say so explicitly.
- Do not fabricate statistics; qualify estimates with "approximately" or \
  "roughly".
- Aim for depth over breadth — a focused, accurate answer beats a \
  superficial overview.
"""


class ResearchAgent(BaseAgent):
    """Gathers information, finds facts, and summarises research on any topic."""

    name = "research_agent"
    description = (
        "Gathers information, finds facts, and summarises research on any topic. "
        "Use this agent when you need background information, data, or an overview "
        "of a subject before writing or coding."
    )

    def run(self, task: str) -> str:  # noqa: D102
        return self._call_api(_RESEARCH_SYSTEM, task)


# ---------------------------------------------------------------------------
# CodeAgent
# ---------------------------------------------------------------------------

_CODE_SYSTEM = """\
You are an expert software engineer. Your job is to write, explain, and debug \
code across any programming language.

Guidelines:
- Write clean, idiomatic, well-commented code.
- Always wrap code in fenced code blocks with the language tag, e.g. ```python.
- After the code block, include a short explanation of how it works and any \
  important edge cases.
- Prefer clarity over cleverness; choose readable variable names.
- If a task is ambiguous, state your assumptions before the code.
- Include type hints in Python and TypeScript code.
"""


class CodeAgent(BaseAgent):
    """Writes, explains, and debugs code in any programming language."""

    name = "code_agent"
    description = (
        "Writes, explains, and debugs code in any programming language. "
        "Use this agent when the task involves implementing a function, algorithm, "
        "script, or when you need a code example to accompany written content."
    )

    def run(self, task: str) -> str:  # noqa: D102
        return self._call_api(_CODE_SYSTEM, task)


# ---------------------------------------------------------------------------
# WritingAgent
# ---------------------------------------------------------------------------

_WRITING_SYSTEM = """\
You are an expert writer and editor. Your job is to draft, refine, and \
structure text across formats: blog posts, reports, summaries, emails, \
documentation, and more.

Guidelines:
- Adapt your tone and style to the requested format (technical, casual, \
  formal, etc.).
- Use clear headings (Markdown ## / ###) to structure longer pieces.
- Keep sentences concise. Prefer active voice.
- Integrate any provided research or code naturally into the prose — do not \
  just paste them verbatim.
- Proofread for grammar and clarity before responding.
"""


class WritingAgent(BaseAgent):
    """Drafts, edits, and structures text in any format or tone."""

    name = "writing_agent"
    description = (
        "Drafts, edits, and structures text in any format or tone — blog posts, "
        "reports, summaries, emails, and documentation. Use this agent when the "
        "task involves producing or polishing written content."
    )

    def run(self, task: str) -> str:  # noqa: D102
        return self._call_api(_WRITING_SYSTEM, task)


# ---------------------------------------------------------------------------
# Agent Registry
# ---------------------------------------------------------------------------

#: Global registry mapping agent names to their instances.
#: The supervisor loads this at startup to derive tool schemas.
AGENT_REGISTRY: dict[str, BaseAgent] = {
    ResearchAgent.name: ResearchAgent(),
    CodeAgent.name: CodeAgent(),
    WritingAgent.name: WritingAgent(),
}
