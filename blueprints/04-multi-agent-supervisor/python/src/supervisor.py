"""
SupervisorAgent for Blueprint 04: Multi-Agent Supervisor.

The supervisor maintains a registry of worker agents, uses the Anthropic API
with tool-calling to decide which agents to invoke, dispatches tasks to those
agents (running same-round calls in parallel), collects results, and synthesises
a final answer.
"""

from __future__ import annotations

import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import anthropic
from tenacity import retry, stop_after_attempt, wait_exponential

from .agents import AGENT_REGISTRY, BaseAgent

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_DEFAULT_MODEL = "claude-sonnet-4-5"
_DEFAULT_MAX_TOKENS = 4096
_DEFAULT_MAX_ITERATIONS = 10

_SUPERVISOR_SYSTEM = """\
You are a supervisor agent responsible for completing complex tasks by \
delegating work to specialised worker agents.

Your workflow:
1. Analyse the user's task and identify what types of expertise are needed.
2. Call the appropriate worker agent(s) with well-scoped subtasks.
3. Review each agent's output. If a result is insufficient, you may call that \
   agent again with a more precise request.
4. Once you have everything you need, synthesise a single, cohesive final \
   response that directly addresses the user's original request.

Important rules:
- Always delegate to the most appropriate agent for each subtask.
- You can call multiple agents in sequence — or the same agent more than once.
- Do NOT attempt to do research, write production code, or draft prose yourself; \
  always delegate those tasks to the relevant worker.
- Your final response (when you stop calling tools) should be complete and \
  polished — the user should not need to read the intermediate agent outputs.
"""

# ---------------------------------------------------------------------------
# Helper types
# ---------------------------------------------------------------------------

ToolUseBlock = Any  # anthropic.types.ToolUseBlock (avoid hard import of private type)
Message = dict[str, Any]


# ---------------------------------------------------------------------------
# SupervisorAgent
# ---------------------------------------------------------------------------


class SupervisorAgent:
    """Central orchestrator that routes tasks to specialised worker agents.

    Args:
        agents: Mapping of agent name to :class:`~agents.BaseAgent` instance.
            Defaults to :data:`~agents.AGENT_REGISTRY`.
        model: Anthropic model identifier. Defaults to the ``ANTHROPIC_MODEL``
            environment variable or ``claude-sonnet-4-5``.
        max_tokens: Maximum tokens for each supervisor API call.
        max_iterations: Hard limit on the number of supervisor→worker dispatch
            rounds to prevent infinite loops.

    Example::

        supervisor = SupervisorAgent()
        result = supervisor.run(
            "Research the top Python web frameworks and write a comparison blog post."
        )
        print(result)
    """

    def __init__(
        self,
        agents: dict[str, BaseAgent] | None = None,
        model: str | None = None,
        max_tokens: int = _DEFAULT_MAX_TOKENS,
        max_iterations: int = _DEFAULT_MAX_ITERATIONS,
    ) -> None:
        self._client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        self._model = model or os.environ.get("ANTHROPIC_MODEL", _DEFAULT_MODEL)
        self._max_tokens = max_tokens
        self._max_iterations = max_iterations
        self._agents: dict[str, BaseAgent] = agents if agents is not None else AGENT_REGISTRY
        self._tools = self._build_tools()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(self, task: str) -> str:
        """Run the supervisor on the given task and return the final answer.

        Args:
            task: The user's natural language request.

        Returns:
            A synthesised response that integrates the outputs of all worker
            agents that were invoked.

        Raises:
            RuntimeError: If the maximum number of iterations is exceeded
                without the supervisor producing a final text response.
            anthropic.APIError: If an unrecoverable API error occurs.
        """
        logger.info("Supervisor starting task: %.100s…", task)

        messages: list[Message] = [{"role": "user", "content": task}]

        for iteration in range(1, self._max_iterations + 1):
            logger.debug("Supervisor iteration %d", iteration)
            response = self._call_supervisor(messages)

            # Check for final text response (no tool calls)
            if response.stop_reason == "end_turn":
                final_text = self._extract_text(response)
                if final_text:
                    logger.info("Supervisor finished after %d iteration(s).", iteration)
                    return final_text

            # Collect all tool_use blocks from the response
            tool_use_blocks = [
                block for block in response.content if block.type == "tool_use"
            ]

            if not tool_use_blocks:
                # Model stopped without tool calls and without text — shouldn't
                # happen in practice, but handle gracefully.
                text = self._extract_text(response)
                if text:
                    return text
                raise RuntimeError(
                    f"Supervisor produced no tool calls and no text on iteration {iteration}."
                )

            # Append the assistant turn (may contain text + tool_use blocks)
            messages.append({"role": "assistant", "content": response.content})

            # Dispatch all tool calls — parallelise within the same round
            tool_results = self._dispatch_tool_calls(tool_use_blocks)

            # Append results as a user turn
            messages.append({"role": "user", "content": tool_results})

        # Iteration cap reached
        raise RuntimeError(
            f"Supervisor reached the maximum of {self._max_iterations} iterations "
            "without producing a final answer. Increase MAX_SUPERVISOR_ITERATIONS "
            "or simplify the task."
        )

    def register_agent(self, agent: BaseAgent) -> None:
        """Add a new worker agent to the registry at runtime.

        Args:
            agent: The agent to register. Its ``name`` attribute is used as
                the tool name.
        """
        self._agents[agent.name] = agent
        self._tools = self._build_tools()  # regenerate tool schemas
        logger.info("Registered new agent: %s", agent.name)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_tools(self) -> list[dict[str, Any]]:
        """Derive Anthropic tool schemas from the agent registry."""
        return [
            {
                "name": agent.name,
                "description": agent.description,
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "task": {
                            "type": "string",
                            "description": (
                                "The specific subtask for this agent to complete. "
                                "Be precise and self-contained — the agent has no "
                                "access to the broader conversation."
                            ),
                        }
                    },
                    "required": ["task"],
                },
            }
            for agent in self._agents.values()
        ]

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    def _call_supervisor(self, messages: list[Message]) -> anthropic.types.Message:
        """Call the Anthropic API for the supervisor model with retry logic."""
        return self._client.messages.create(
            model=self._model,
            max_tokens=self._max_tokens,
            system=_SUPERVISOR_SYSTEM,
            tools=self._tools,  # type: ignore[arg-type]
            messages=messages,  # type: ignore[arg-type]
        )

    def _dispatch_tool_calls(
        self, tool_use_blocks: list[ToolUseBlock]
    ) -> list[dict[str, Any]]:
        """Dispatch a batch of tool_use blocks to the corresponding agents.

        Calls within the same batch are executed in parallel using a thread
        pool, which reduces round-trip latency when the supervisor invokes
        multiple agents simultaneously.

        Args:
            tool_use_blocks: List of tool_use content blocks from the supervisor.

        Returns:
            A list of ``tool_result`` content dicts ready to be appended to the
            conversation as a user turn.
        """
        results: dict[str, str] = {}

        with ThreadPoolExecutor(max_workers=len(tool_use_blocks)) as executor:
            future_to_block = {
                executor.submit(self._invoke_agent, block): block
                for block in tool_use_blocks
            }
            for future in as_completed(future_to_block):
                block = future_to_block[future]
                try:
                    result = future.result()
                except Exception as exc:
                    logger.error(
                        "Agent %s raised an exception: %s", block.name, exc, exc_info=True
                    )
                    result = f"Error: {exc}"
                results[block.id] = result

        # Preserve the original order of tool calls in the result list
        return [
            {
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": results[block.id],
            }
            for block in tool_use_blocks
        ]

    def _invoke_agent(self, block: ToolUseBlock) -> str:
        """Look up and call the worker agent for a single tool_use block.

        Args:
            block: A ``tool_use`` content block from the supervisor response.

        Returns:
            The agent's string output.

        Raises:
            ValueError: If no agent is registered under ``block.name``.
        """
        agent_name: str = block.name
        inputs: dict[str, Any] = block.input if isinstance(block.input, dict) else json.loads(block.input)
        task: str = inputs.get("task", "")

        agent = self._agents.get(agent_name)
        if agent is None:
            known = ", ".join(self._agents)
            raise ValueError(
                f"No agent registered as '{agent_name}'. Known agents: {known}."
            )

        logger.info("Dispatching to %s: %.80s…", agent_name, task)
        result = agent.run(task)
        logger.info(
            "%s returned %d characters.", agent_name, len(result)
        )
        return result

    @staticmethod
    def _extract_text(response: anthropic.types.Message) -> str:
        """Extract concatenated text from a response's content blocks."""
        return "\n\n".join(
            block.text for block in response.content if block.type == "text"
        )
