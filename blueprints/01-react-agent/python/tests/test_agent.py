"""
Tests for the ReAct Agent blueprint.

Test strategy:
- Unit tests for tools (calculator, get_current_time, web_search)
- Unit tests for agent internals (_call_tool dispatch, _extract_text)
- Integration test for a full agent.run() call with a mocked Anthropic client

Run with:
    uv run test
    # or
    pytest tests/ -v
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from src.agent import ReActAgent
from src.tools import TOOL_DEFINITIONS, calculator, get_current_time, web_search


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_client() -> MagicMock:
    """Return a mock Anthropic client."""
    return MagicMock()


@pytest.fixture
def agent(mock_client: MagicMock) -> ReActAgent:
    """Return a fully configured ReActAgent with a mock client."""
    a = ReActAgent(
        model="claude-opus-4-6",
        tools=TOOL_DEFINITIONS,
        max_iterations=5,
        client=mock_client,
    )
    a.register_tool("calculator", calculator)
    a.register_tool("get_current_time", get_current_time)
    a.register_tool("web_search", web_search)
    return a


# ---------------------------------------------------------------------------
# Helper factories for mock response objects
# ---------------------------------------------------------------------------


def make_text_block(text: str) -> MagicMock:
    block = MagicMock()
    block.type = "text"
    block.text = text
    return block


def make_tool_use_block(
    tool_use_id: str, name: str, tool_input: dict[str, Any]
) -> MagicMock:
    block = MagicMock()
    block.type = "tool_use"
    block.id = tool_use_id
    block.name = name
    block.tool_input = tool_input
    return block


def make_response(
    stop_reason: str,
    content: list[MagicMock],
) -> MagicMock:
    resp = MagicMock()
    resp.stop_reason = stop_reason
    resp.content = content
    return resp


# ---------------------------------------------------------------------------
# Agent initialisation tests
# ---------------------------------------------------------------------------


class TestAgentInit:
    def test_default_attributes(self, mock_client: MagicMock) -> None:
        a = ReActAgent(
            model="claude-opus-4-6",
            tools=TOOL_DEFINITIONS,
            client=mock_client,
        )
        assert a.model == "claude-opus-4-6"
        assert a.tools is TOOL_DEFINITIONS
        assert a.max_iterations == 10
        assert "tool" in a.system_prompt.lower()

    def test_custom_max_iterations(self, mock_client: MagicMock) -> None:
        a = ReActAgent(
            model="claude-opus-4-6",
            tools=[],
            max_iterations=3,
            client=mock_client,
        )
        assert a.max_iterations == 3

    def test_custom_system_prompt(self, mock_client: MagicMock) -> None:
        custom = "You are a test agent."
        a = ReActAgent(
            model="claude-opus-4-6",
            tools=[],
            system_prompt=custom,
            client=mock_client,
        )
        assert a.system_prompt == custom

    def test_tool_registry_empty_on_init(self, mock_client: MagicMock) -> None:
        a = ReActAgent(model="claude-opus-4-6", tools=[], client=mock_client)
        # pylint: disable=protected-access
        assert len(a._tool_registry) == 0

    def test_register_tool(self, mock_client: MagicMock) -> None:
        a = ReActAgent(model="claude-opus-4-6", tools=[], client=mock_client)
        a.register_tool("my_tool", lambda x: x)
        assert "my_tool" in a._tool_registry  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Tool dispatch tests
# ---------------------------------------------------------------------------


class TestCallTool:
    def test_unknown_tool_returns_error_string(self, agent: ReActAgent) -> None:
        result = agent._call_tool("nonexistent_tool", {})  # type: ignore[attr-defined]
        assert "Error" in result
        assert "nonexistent_tool" in result

    def test_calculator_dispatched_correctly(self, agent: ReActAgent) -> None:
        result = agent._call_tool("calculator", {"expression": "2 + 2"})  # type: ignore[attr-defined]
        assert result == "4"

    def test_get_current_time_dispatched(self, agent: ReActAgent) -> None:
        result = agent._call_tool("get_current_time", {"timezone": "UTC"})  # type: ignore[attr-defined]
        assert "UTC" in result
        assert result.startswith("202")  # starts with year

    def test_web_search_dispatched(self, agent: ReActAgent) -> None:
        result = agent._call_tool("web_search", {"query": "test query"})  # type: ignore[attr-defined]
        assert "test query" in result

    def test_tool_with_invalid_args_returns_error(self, agent: ReActAgent) -> None:
        # calculator expects 'expression' kwarg; passing wrong kwarg causes TypeError
        result = agent._call_tool("calculator", {"wrong_param": "2+2"})  # type: ignore[attr-defined]
        assert "Error" in result

    def test_tool_exception_returns_error_string(self, agent: ReActAgent) -> None:
        def failing_tool(**kwargs: Any) -> str:
            raise RuntimeError("Something went wrong")

        agent.register_tool("failing", failing_tool)
        result = agent._call_tool("failing", {})  # type: ignore[attr-defined]
        assert "Error" in result
        assert "failing" in result


# ---------------------------------------------------------------------------
# Calculator tool tests
# ---------------------------------------------------------------------------


class TestCalculator:
    @pytest.mark.parametrize(
        "expression,expected",
        [
            ("2 + 2", "4"),
            ("10 - 3", "7"),
            ("4 * 5", "20"),
            ("10 / 4", "2.5"),
            ("10 // 3", "3"),
            ("10 % 3", "1"),
            ("2 ** 10", "1024"),
            ("sqrt(144)", "12"),
            ("round(3.14159, 2)", "3.14"),
            ("-5 + 10", "5"),
        ],
    )
    def test_basic_arithmetic(self, expression: str, expected: str) -> None:
        assert calculator(expression) == expected

    def test_division_by_zero(self) -> None:
        result = calculator("1 / 0")
        assert "Error" in result
        assert "zero" in result.lower()

    def test_disallowed_builtin(self) -> None:
        result = calculator("__import__('os')")
        assert "Error" in result

    def test_disallowed_string(self) -> None:
        result = calculator("'hello' + 'world'")
        assert "Error" in result

    def test_math_constants(self) -> None:
        import math

        result = calculator("pi")
        assert float(result) == pytest.approx(math.pi)

    def test_nested_expression(self) -> None:
        result = calculator("sqrt(2 ** 8)")
        assert result == "16"

    def test_empty_expression(self) -> None:
        result = calculator("")
        assert "Error" in result


# ---------------------------------------------------------------------------
# get_current_time tool tests
# ---------------------------------------------------------------------------


class TestGetCurrentTime:
    def test_utc_returns_valid_datetime(self) -> None:
        result = get_current_time("UTC")
        assert "UTC" in result
        # Should look like "2024-01-15 12:34:56 UTC (+0000)"
        assert len(result) > 10

    def test_unknown_timezone_returns_error(self) -> None:
        result = get_current_time("Fake/Timezone")
        assert "Error" in result
        assert "Fake/Timezone" in result

    def test_default_timezone_is_utc(self) -> None:
        result = get_current_time()
        assert "UTC" in result

    def test_new_york_timezone(self) -> None:
        result = get_current_time("America/New_York")
        # Either EST or EDT depending on time of year
        assert "E" in result  # EST or EDT

    def test_result_starts_with_year(self) -> None:
        result = get_current_time("UTC")
        assert result.startswith("20")


# ---------------------------------------------------------------------------
# web_search tool tests
# ---------------------------------------------------------------------------


class TestWebSearch:
    def test_returns_string(self) -> None:
        result = web_search("test query")
        assert isinstance(result, str)

    def test_contains_query(self) -> None:
        result = web_search("artificial intelligence")
        assert "artificial intelligence" in result

    def test_contains_simulation_note(self) -> None:
        result = web_search("anything")
        assert "simulated" in result.lower() or "SIMULATED" in result

    def test_returns_multiple_results(self) -> None:
        result = web_search("Python programming")
        # Should have at least result 1 and result 2
        assert "1." in result
        assert "2." in result


# ---------------------------------------------------------------------------
# extract_text helper tests
# ---------------------------------------------------------------------------


class TestExtractText:
    def test_single_text_block(self, mock_client: MagicMock) -> None:
        a = ReActAgent(model="claude-opus-4-6", tools=[], client=mock_client)
        block = make_text_block("Hello, world!")
        result = a._extract_text([block])  # type: ignore[attr-defined]
        assert result == "Hello, world!"

    def test_multiple_text_blocks(self, mock_client: MagicMock) -> None:
        a = ReActAgent(model="claude-opus-4-6", tools=[], client=mock_client)
        blocks = [make_text_block("Part 1."), make_text_block("Part 2.")]
        result = a._extract_text(blocks)  # type: ignore[attr-defined]
        assert "Part 1." in result
        assert "Part 2." in result

    def test_ignores_non_text_blocks(self, mock_client: MagicMock) -> None:
        a = ReActAgent(model="claude-opus-4-6", tools=[], client=mock_client)
        tool_block = make_tool_use_block("id1", "calculator", {"expression": "2+2"})
        text_block = make_text_block("Final answer")
        result = a._extract_text([tool_block, text_block])  # type: ignore[attr-defined]
        assert result == "Final answer"

    def test_empty_content_returns_empty_string(self, mock_client: MagicMock) -> None:
        a = ReActAgent(model="claude-opus-4-6", tools=[], client=mock_client)
        result = a._extract_text([])  # type: ignore[attr-defined]
        assert result == ""


# ---------------------------------------------------------------------------
# Full agent.run() integration tests (mocked API)
# ---------------------------------------------------------------------------


class TestAgentRun:
    def test_single_turn_no_tools(
        self, agent: ReActAgent, mock_client: MagicMock
    ) -> None:
        """Agent returns immediately when model answers without using tools."""
        final_text = "The answer is 42."
        mock_client.messages.create.return_value = make_response(
            stop_reason="end_turn",
            content=[make_text_block(final_text)],
        )

        result = agent.run("What is the meaning of life?")
        assert result == final_text
        assert mock_client.messages.create.call_count == 1

    def test_one_tool_call_then_answer(
        self, agent: ReActAgent, mock_client: MagicMock
    ) -> None:
        """Agent calls calculator once, then returns the final answer."""
        tool_call_response = make_response(
            stop_reason="tool_use",
            content=[
                make_tool_use_block("tu_001", "calculator", {"expression": "2 ** 10"}),
            ],
        )
        final_response = make_response(
            stop_reason="end_turn",
            content=[make_text_block("2 to the power of 10 is 1024.")],
        )
        mock_client.messages.create.side_effect = [tool_call_response, final_response]

        result = agent.run("What is 2 to the power of 10?")

        assert result == "2 to the power of 10 is 1024."
        assert mock_client.messages.create.call_count == 2

    def test_max_iterations_exceeded(
        self, agent: ReActAgent, mock_client: MagicMock
    ) -> None:
        """Agent returns an error message when max_iterations is reached."""
        # Always return a tool_use response — agent will loop until max_iterations
        tool_call_response = make_response(
            stop_reason="tool_use",
            content=[
                make_tool_use_block("tu_loop", "calculator", {"expression": "1 + 1"}),
            ],
        )
        mock_client.messages.create.return_value = tool_call_response

        result = agent.run("Loop forever")

        assert "Max iterations" in result
        assert mock_client.messages.create.call_count == agent.max_iterations

    def test_message_history_structure(
        self, agent: ReActAgent, mock_client: MagicMock
    ) -> None:
        """Verify that message history follows the expected structure after a tool call."""
        tool_call_response = make_response(
            stop_reason="tool_use",
            content=[
                make_tool_use_block("tu_002", "calculator", {"expression": "10 * 10"}),
            ],
        )
        final_response = make_response(
            stop_reason="end_turn",
            content=[make_text_block("10 * 10 = 100")],
        )
        mock_client.messages.create.side_effect = [tool_call_response, final_response]

        agent.run("What is 10 times 10?")

        # Second API call should have 3 messages: user, assistant(tool_use), user(tool_result)
        second_call_kwargs = mock_client.messages.create.call_args_list[1].kwargs
        messages = second_call_kwargs["messages"]

        assert messages[0]["role"] == "user"
        assert messages[1]["role"] == "assistant"
        assert messages[2]["role"] == "user"
        # The third message (tool result) should contain tool_result content
        tool_result_content = messages[2]["content"]
        assert isinstance(tool_result_content, list)
        assert tool_result_content[0]["type"] == "tool_result"
        assert tool_result_content[0]["tool_use_id"] == "tu_002"
        assert tool_result_content[0]["content"] == "100"

    def test_unknown_tool_call_handled_gracefully(
        self, agent: ReActAgent, mock_client: MagicMock
    ) -> None:
        """When the model calls an unknown tool, an error result is sent back (not a crash)."""
        tool_call_response = make_response(
            stop_reason="tool_use",
            content=[
                make_tool_use_block("tu_003", "unknown_tool", {"arg": "value"}),
            ],
        )
        final_response = make_response(
            stop_reason="end_turn",
            content=[make_text_block("I tried to use unknown_tool but it failed.")],
        )
        mock_client.messages.create.side_effect = [tool_call_response, final_response]

        result = agent.run("Use the unknown tool")

        # Should not raise — the error should be passed as a tool result
        assert isinstance(result, str)
        # Check that the error was included in the second API call's messages
        second_call_kwargs = mock_client.messages.create.call_args_list[1].kwargs
        messages = second_call_kwargs["messages"]
        tool_result = messages[2]["content"][0]
        assert "Error" in tool_result["content"]
        assert "unknown_tool" in tool_result["content"]

    def test_tools_passed_to_api(
        self, agent: ReActAgent, mock_client: MagicMock
    ) -> None:
        """Tool definitions are forwarded to the Anthropic API on every call."""
        mock_client.messages.create.return_value = make_response(
            stop_reason="end_turn",
            content=[make_text_block("Done.")],
        )

        agent.run("Do something")

        call_kwargs = mock_client.messages.create.call_args.kwargs
        assert call_kwargs["tools"] is TOOL_DEFINITIONS

    def test_system_prompt_passed_to_api(
        self, agent: ReActAgent, mock_client: MagicMock
    ) -> None:
        """System prompt is forwarded to the Anthropic API."""
        mock_client.messages.create.return_value = make_response(
            stop_reason="end_turn",
            content=[make_text_block("Done.")],
        )

        agent.run("Hi")

        call_kwargs = mock_client.messages.create.call_args.kwargs
        assert call_kwargs["system"] == agent.system_prompt
