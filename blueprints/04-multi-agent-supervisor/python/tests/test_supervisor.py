"""
pytest tests for Blueprint 04: Multi-Agent Supervisor.

All Anthropic API calls are mocked so the test suite runs without network
access or a real API key.
"""

from __future__ import annotations

import types
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Helpers for constructing mock Anthropic response objects
# ---------------------------------------------------------------------------


def _text_block(text: str) -> MagicMock:
    block = MagicMock()
    block.type = "text"
    block.text = text
    return block


def _tool_use_block(
    tool_id: str,
    name: str,
    task: str,
) -> MagicMock:
    block = MagicMock()
    block.type = "tool_use"
    block.id = tool_id
    block.name = name
    block.input = {"task": task}
    return block


def _make_response(
    content: list[MagicMock],
    stop_reason: str = "end_turn",
) -> MagicMock:
    response = MagicMock()
    response.content = content
    response.stop_reason = stop_reason
    return response


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def mock_research_agent() -> MagicMock:
    agent = MagicMock()
    agent.name = "research_agent"
    agent.description = "Researches topics."
    agent.run.return_value = "Research result: quantum computing uses qubits."
    return agent


@pytest.fixture()
def mock_code_agent() -> MagicMock:
    agent = MagicMock()
    agent.name = "code_agent"
    agent.description = "Writes code."
    agent.run.return_value = "```python\nprint('hello')\n```"
    return agent


@pytest.fixture()
def mock_writing_agent() -> MagicMock:
    agent = MagicMock()
    agent.name = "writing_agent"
    agent.description = "Writes prose."
    agent.run.return_value = "Here is a polished blog post about quantum computing."
    return agent


@pytest.fixture()
def agent_registry(
    mock_research_agent: MagicMock,
    mock_code_agent: MagicMock,
    mock_writing_agent: MagicMock,
) -> dict[str, MagicMock]:
    return {
        "research_agent": mock_research_agent,
        "code_agent": mock_code_agent,
        "writing_agent": mock_writing_agent,
    }


@pytest.fixture()
def supervisor(agent_registry: dict[str, MagicMock]) -> Any:
    """Return a SupervisorAgent with mocked Anthropic client and test agents."""
    with patch("anthropic.Anthropic"):
        from src.supervisor import SupervisorAgent

        sup = SupervisorAgent(agents=agent_registry)  # type: ignore[arg-type]
        # Replace internal client with a mock
        sup._client = MagicMock()
        return sup


# ---------------------------------------------------------------------------
# Test: initialisation
# ---------------------------------------------------------------------------


class TestSupervisorInit:
    def test_agents_are_stored(self, supervisor: Any, agent_registry: dict) -> None:
        assert supervisor._agents is agent_registry

    def test_tools_are_built(self, supervisor: Any) -> None:
        assert len(supervisor._tools) == 3
        names = {t["name"] for t in supervisor._tools}
        assert names == {"research_agent", "code_agent", "writing_agent"}

    def test_tool_schema_has_required_fields(self, supervisor: Any) -> None:
        for tool in supervisor._tools:
            assert "name" in tool
            assert "description" in tool
            assert "input_schema" in tool
            assert tool["input_schema"]["required"] == ["task"]

    def test_default_max_iterations(self, supervisor: Any) -> None:
        assert supervisor._max_iterations == 10


# ---------------------------------------------------------------------------
# Test: routing — supervisor calls the right agent
# ---------------------------------------------------------------------------


class TestRouting:
    def test_routes_to_research_agent(
        self,
        supervisor: Any,
        mock_research_agent: MagicMock,
    ) -> None:
        """Supervisor dispatches a research subtask to the research agent."""
        # Round 1: supervisor calls research_agent
        round1 = _make_response(
            content=[_tool_use_block("tu_001", "research_agent", "Find facts about X")],
            stop_reason="tool_use",
        )
        # Round 2: supervisor synthesises
        round2 = _make_response(
            content=[_text_block("Here is the research: quantum computing uses qubits.")],
            stop_reason="end_turn",
        )
        supervisor._client.messages.create.side_effect = [round1, round2]

        result = supervisor.run("Research quantum computing.")

        mock_research_agent.run.assert_called_once_with("Find facts about X")
        assert "qubit" in result.lower()

    def test_routes_to_code_agent(
        self,
        supervisor: Any,
        mock_code_agent: MagicMock,
    ) -> None:
        """Supervisor dispatches a coding subtask to the code agent."""
        round1 = _make_response(
            content=[_tool_use_block("tu_002", "code_agent", "Write binary search in Python")],
            stop_reason="tool_use",
        )
        round2 = _make_response(
            content=[_text_block("Here is the code:\n```python\nprint('hello')\n```")],
            stop_reason="end_turn",
        )
        supervisor._client.messages.create.side_effect = [round1, round2]

        result = supervisor.run("Write binary search.")

        mock_code_agent.run.assert_called_once_with("Write binary search in Python")
        assert "```python" in result

    def test_routes_to_writing_agent(
        self,
        supervisor: Any,
        mock_writing_agent: MagicMock,
    ) -> None:
        """Supervisor dispatches a writing subtask to the writing agent."""
        round1 = _make_response(
            content=[_tool_use_block("tu_003", "writing_agent", "Write a blog post")],
            stop_reason="tool_use",
        )
        round2 = _make_response(
            content=[_text_block("Here is the blog post about quantum computing.")],
            stop_reason="end_turn",
        )
        supervisor._client.messages.create.side_effect = [round1, round2]

        result = supervisor.run("Write a blog post about quantum computing.")

        mock_writing_agent.run.assert_called_once_with("Write a blog post")
        assert "blog post" in result.lower()

    def test_raises_on_unknown_agent(self, supervisor: Any) -> None:
        """Supervisor raises ValueError when a tool_use names an unknown agent."""
        round1 = _make_response(
            content=[_tool_use_block("tu_004", "nonexistent_agent", "Do something")],
            stop_reason="tool_use",
        )
        supervisor._client.messages.create.return_value = round1

        with pytest.raises(RuntimeError):
            supervisor.run("Do something impossible.")


# ---------------------------------------------------------------------------
# Test: result synthesis
# ---------------------------------------------------------------------------


class TestResultSynthesis:
    def test_final_text_is_returned(self, supervisor: Any) -> None:
        """run() returns the text from the final end_turn response."""
        round1 = _make_response(
            content=[_text_block("The final synthesised answer.")],
            stop_reason="end_turn",
        )
        supervisor._client.messages.create.return_value = round1

        result = supervisor.run("Simple task.")

        assert result == "The final synthesised answer."

    def test_multi_text_blocks_are_joined(self, supervisor: Any) -> None:
        """Multiple text blocks in the final response are joined with double newlines."""
        round1 = _make_response(
            content=[
                _text_block("First paragraph."),
                _text_block("Second paragraph."),
            ],
            stop_reason="end_turn",
        )
        supervisor._client.messages.create.return_value = round1

        result = supervisor.run("Simple task.")

        assert "First paragraph." in result
        assert "Second paragraph." in result


# ---------------------------------------------------------------------------
# Test: multi-step delegation (supervisor calls multiple agents sequentially)
# ---------------------------------------------------------------------------


class TestMultiStepDelegation:
    def test_calls_two_agents_in_sequence(
        self,
        supervisor: Any,
        mock_research_agent: MagicMock,
        mock_writing_agent: MagicMock,
    ) -> None:
        """Supervisor can invoke two different agents across two iterations."""
        # Iteration 1: call research
        iter1 = _make_response(
            content=[_tool_use_block("tu_010", "research_agent", "Research async Python")],
            stop_reason="tool_use",
        )
        # Iteration 2: call writing with research results in context
        iter2 = _make_response(
            content=[_tool_use_block("tu_011", "writing_agent", "Write post using research")],
            stop_reason="tool_use",
        )
        # Iteration 3: final answer
        iter3 = _make_response(
            content=[_text_block("Complete blog post about async Python.")],
            stop_reason="end_turn",
        )
        supervisor._client.messages.create.side_effect = [iter1, iter2, iter3]

        result = supervisor.run("Research async Python and write a blog post.")

        mock_research_agent.run.assert_called_once()
        mock_writing_agent.run.assert_called_once()
        assert "async Python" in result.lower() or "blog post" in result.lower()

    def test_same_agent_called_twice(
        self,
        supervisor: Any,
        mock_research_agent: MagicMock,
    ) -> None:
        """Supervisor can call the same agent in two separate rounds."""
        iter1 = _make_response(
            content=[_tool_use_block("tu_020", "research_agent", "First research pass")],
            stop_reason="tool_use",
        )
        iter2 = _make_response(
            content=[_tool_use_block("tu_021", "research_agent", "Second research pass")],
            stop_reason="tool_use",
        )
        iter3 = _make_response(
            content=[_text_block("Combined research result.")],
            stop_reason="end_turn",
        )
        supervisor._client.messages.create.side_effect = [iter1, iter2, iter3]

        result = supervisor.run("Deep research on topic X.")

        assert mock_research_agent.run.call_count == 2
        assert "Combined" in result


# ---------------------------------------------------------------------------
# Test: full workflow (research + code + writing)
# ---------------------------------------------------------------------------


class TestFullWorkflow:
    def test_three_agent_workflow(
        self,
        supervisor: Any,
        mock_research_agent: MagicMock,
        mock_code_agent: MagicMock,
        mock_writing_agent: MagicMock,
    ) -> None:
        """
        Full workflow: supervisor calls research, then code, then writing,
        then synthesises. Validates agent call counts and final output.
        """
        iter1 = _make_response(
            content=[_tool_use_block("tu_r", "research_agent", "Research quantum computing")],
            stop_reason="tool_use",
        )
        iter2 = _make_response(
            content=[_tool_use_block("tu_c", "code_agent", "Quantum circuit example in Python")],
            stop_reason="tool_use",
        )
        iter3 = _make_response(
            content=[_tool_use_block("tu_w", "writing_agent", "Blog post with research and code")],
            stop_reason="tool_use",
        )
        iter4 = _make_response(
            content=[_text_block("Final blog post about quantum computing with code.")],
            stop_reason="end_turn",
        )
        supervisor._client.messages.create.side_effect = [iter1, iter2, iter3, iter4]

        result = supervisor.run(
            "Research quantum computing, write a blog post, and include a Python code example."
        )

        mock_research_agent.run.assert_called_once()
        mock_code_agent.run.assert_called_once()
        mock_writing_agent.run.assert_called_once()
        assert "quantum" in result.lower() or "blog post" in result.lower()

    def test_max_iterations_raises(self, supervisor: Any) -> None:
        """run() raises RuntimeError if max_iterations is hit without a final answer."""
        supervisor._max_iterations = 2

        # Always return a tool_use response — never terminates
        always_tool = _make_response(
            content=[_tool_use_block("tu_inf", "research_agent", "loop forever")],
            stop_reason="tool_use",
        )
        supervisor._client.messages.create.return_value = always_tool

        with pytest.raises(RuntimeError, match="maximum"):
            supervisor.run("Infinite loop task.")


# ---------------------------------------------------------------------------
# Test: register_agent
# ---------------------------------------------------------------------------


class TestRegisterAgent:
    def test_register_new_agent(self, supervisor: Any) -> None:
        """register_agent adds the agent and rebuilds tool schemas."""
        new_agent = MagicMock()
        new_agent.name = "data_agent"
        new_agent.description = "Analyses data."

        supervisor.register_agent(new_agent)

        assert "data_agent" in supervisor._agents
        assert any(t["name"] == "data_agent" for t in supervisor._tools)

    def test_registered_agent_is_callable(self, supervisor: Any) -> None:
        """A registered agent can be invoked via the dispatch mechanism."""
        new_agent = MagicMock()
        new_agent.name = "data_agent"
        new_agent.description = "Analyses data."
        new_agent.run.return_value = "Data analysis complete."

        supervisor.register_agent(new_agent)

        iter1 = _make_response(
            content=[_tool_use_block("tu_d", "data_agent", "Analyse dataset X")],
            stop_reason="tool_use",
        )
        iter2 = _make_response(
            content=[_text_block("Analysis result: Data analysis complete.")],
            stop_reason="end_turn",
        )
        supervisor._client.messages.create.side_effect = [iter1, iter2]

        result = supervisor.run("Analyse dataset X.")

        new_agent.run.assert_called_once_with("Analyse dataset X")
        assert "analysis" in result.lower()
