"""
ReAct Agent implementation using the Anthropic SDK.

The ReAct (Reasoning + Acting) pattern interleaves reasoning traces with tool calls:
  1. The model reasons about what to do (Think)
  2. The model calls a tool (Act)
  3. The tool result is added to the conversation (Observe)
  4. Steps 1-3 repeat until the model produces a final text answer

References:
  - ReAct paper: https://arxiv.org/abs/2210.03629
  - Anthropic Tool Use: https://docs.anthropic.com/en/docs/tool-use
"""

from __future__ import annotations

import json
import logging
from typing import Any, Callable

import anthropic

logger = logging.getLogger(__name__)


class ReActAgent:
    """
    A ReAct agent that interleaves reasoning and tool use to answer queries.

    The agent maintains a message history for the duration of a single `run()` call.
    It is stateless across calls — each call to `run()` starts a fresh conversation.

    Attributes:
        model: The Anthropic model identifier to use.
        tools: Tool definitions in Anthropic tool format (list of dicts).
        max_iterations: Maximum number of think-act-observe cycles before giving up.
        system_prompt: Optional system prompt to set the agent's persona/constraints.
    """

    DEFAULT_SYSTEM_PROMPT = """\
You are a helpful AI assistant with access to tools. Use the available tools whenever \
they would help you give a more accurate or complete answer.

When answering:
1. Think about what information or computation you need
2. Use tools to gather that information
3. Reason about the results
4. Provide a clear, concise final answer

Always be transparent about what tools you used and what you found.\
"""

    def __init__(
        self,
        model: str,
        tools: list[dict[str, Any]],
        max_iterations: int = 10,
        system_prompt: str | None = None,
        client: anthropic.Anthropic | None = None,
    ) -> None:
        """
        Initialise the ReAct agent.

        Args:
            model: Anthropic model ID, e.g. "claude-opus-4-6".
            tools: Tool definitions in Anthropic format. Use TOOL_DEFINITIONS from tools.py.
            max_iterations: Maximum think-act-observe cycles. Guards against infinite loops.
            system_prompt: System prompt override. Uses DEFAULT_SYSTEM_PROMPT if None.
            client: Anthropic client instance. Creates a new one if None (reads ANTHROPIC_API_KEY).
        """
        self.model = model
        self.tools = tools
        self.max_iterations = max_iterations
        self.system_prompt = system_prompt or self.DEFAULT_SYSTEM_PROMPT
        self._client = client or anthropic.Anthropic()

        # Build the tool registry: name → callable
        # Populated by register_tool() calls; callers typically use register_tools_from_module()
        self._tool_registry: dict[str, Callable[..., str]] = {}

    def register_tool(self, name: str, fn: Callable[..., str]) -> None:
        """
        Register a callable under a tool name.

        The name must match the "name" field in the corresponding tool definition
        passed to __init__.

        Args:
            name: Tool name as it appears in tool definitions.
            fn: Callable that implements the tool. Must return a string.
        """
        self._tool_registry[name] = fn
        logger.debug("Registered tool: %s", name)

    def run(self, query: str) -> str:
        """
        Execute the ReAct loop for the given query.

        The agent repeatedly:
          1. Calls the Claude API with current message history
          2. If stop_reason == "tool_use": executes tools and appends results
          3. If stop_reason == "end_turn": returns the final text answer

        Args:
            query: The user's question or task.

        Returns:
            The agent's final text answer, or an error message if max_iterations
            is exceeded or no text response is found.
        """
        messages: list[dict[str, Any]] = [{"role": "user", "content": query}]

        logger.info("Starting ReAct loop for query: %r", query)
        print(f"\nUser: {query}")
        print("-" * 60)

        for iteration in range(self.max_iterations):
            logger.debug("Iteration %d / %d", iteration + 1, self.max_iterations)

            # --- Think: call the model ---
            response = self._client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=self.system_prompt,
                tools=self.tools,  # type: ignore[arg-type]
                messages=messages,  # type: ignore[arg-type]
            )

            logger.debug(
                "Response stop_reason=%s, content blocks=%d",
                response.stop_reason,
                len(response.content),
            )

            # Print any text blocks from this response (the reasoning)
            for block in response.content:
                if block.type == "text" and block.text:
                    print(f"\nAgent [iteration {iteration + 1}]: {block.text}")

            # Append the full assistant response to history
            messages.append({"role": "assistant", "content": response.content})

            # --- Check if we're done ---
            if response.stop_reason == "end_turn":
                # Extract the final text answer
                final_text = self._extract_text(response.content)
                if final_text:
                    logger.info("Agent completed in %d iteration(s)", iteration + 1)
                    return final_text
                # No text content — this shouldn't happen normally
                return "Agent completed but produced no text response."

            # --- Act: find and execute tool calls ---
            if response.stop_reason == "tool_use":
                tool_results: list[dict[str, Any]] = []

                for block in response.content:
                    if block.type != "tool_use":
                        continue

                    tool_name = block.name
                    tool_input = block.tool_input
                    tool_use_id = block.id

                    print(f"\n  [Tool call] {tool_name}({json.dumps(tool_input, indent=2)})")
                    logger.debug("Calling tool %r with input: %s", tool_name, tool_input)

                    # --- Observe: execute the tool ---
                    result = self._call_tool(tool_name, tool_input)
                    print(f"  [Tool result] {result[:200]}{'...' if len(result) > 200 else ''}")
                    logger.debug("Tool %r returned: %s", tool_name, result[:500])

                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_use_id,
                            "content": result,
                        }
                    )

                # Append tool results as a user message (Anthropic API convention)
                messages.append({"role": "user", "content": tool_results})
                continue

            # Unexpected stop reason — bail out
            logger.warning("Unexpected stop_reason: %s", response.stop_reason)
            return f"Agent stopped unexpectedly with reason: {response.stop_reason}"

        # Exhausted all iterations
        logger.warning("Max iterations (%d) reached without a final answer", self.max_iterations)
        return (
            f"Max iterations ({self.max_iterations}) reached without a final answer. "
            "Try simplifying your query or increasing max_iterations."
        )

    def _call_tool(self, tool_name: str, tool_input: dict[str, Any]) -> str:
        """
        Dispatch a tool call to the registered tool function.

        Catches all exceptions so that errors are returned as strings rather than
        propagating and crashing the agent loop. The model can then see the error
        and decide how to recover.

        Args:
            tool_name: The name of the tool to call.
            tool_input: The arguments to pass to the tool function (as keyword args).

        Returns:
            The tool's string result, or an error message string.
        """
        fn = self._tool_registry.get(tool_name)
        if fn is None:
            registered = list(self._tool_registry.keys())
            return (
                f"Error: Unknown tool {tool_name!r}. "
                f"Available tools: {registered}"
            )
        try:
            result = fn(**tool_input)
            # Ensure we always return a string
            return result if isinstance(result, str) else json.dumps(result)
        except TypeError as exc:
            return f"Error: Tool {tool_name!r} received invalid arguments: {exc}"
        except Exception as exc:
            logger.exception("Tool %r raised an exception", tool_name)
            return f"Error: Tool {tool_name!r} failed with: {exc}"

    @staticmethod
    def _extract_text(content: list[Any]) -> str:
        """
        Extract and concatenate all text blocks from a response content list.

        Args:
            content: List of content blocks from an Anthropic API response.

        Returns:
            Concatenated text from all text blocks, stripped of leading/trailing whitespace.
        """
        parts: list[str] = []
        for block in content:
            if hasattr(block, "type") and block.type == "text":
                parts.append(block.text)
        return "\n".join(parts).strip()
