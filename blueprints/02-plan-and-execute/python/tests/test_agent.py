from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

from src.agent import PlanExecuteAgent
from src.tools import TOOL_DEFINITIONS, calculator, get_current_time, web_search


def make_text_block(text: str) -> MagicMock:
    block = MagicMock()
    block.type = "text"
    block.text = text
    return block


def make_tool_use_block(tool_use_id: str, name: str, payload: dict[str, Any]) -> MagicMock:
    block = MagicMock()
    block.type = "tool_use"
    block.id = tool_use_id
    block.name = name
    block.input = payload
    return block


def make_response(stop_reason: str, content: list[MagicMock]) -> MagicMock:
    response = MagicMock()
    response.stop_reason = stop_reason
    response.content = content
    return response


def make_agent(mock_client: MagicMock) -> PlanExecuteAgent:
    agent = PlanExecuteAgent(
        model="claude-opus-4-6",
        tools=TOOL_DEFINITIONS,
        client=mock_client,
    )
    agent.register_tool("calculator", calculator)
    agent.register_tool("get_current_time", get_current_time)
    agent.register_tool("web_search", web_search)
    return agent


def test_parse_plan_success() -> None:
    raw = '[{"id": 1, "objective": "Find baseline metrics"}, {"id": 2, "objective": "Propose fixes"}]'
    parsed = PlanExecuteAgent._parse_plan(raw)
    assert len(parsed) == 2
    assert parsed[0].id == 1
    assert parsed[1].objective == "Propose fixes"


def test_parse_plan_invalid_json() -> None:
    parsed = PlanExecuteAgent._parse_plan("not json")
    assert parsed == []


def test_run_happy_path_with_tool_use() -> None:
    client = MagicMock()
    agent = make_agent(client)

    # 1) Planner output
    planner = make_response(
        "end_turn",
        [
            make_text_block(
                '[{"id": 1, "objective": "Get current UTC time"}, '
                '{"id": 2, "objective": "Square the hour value"}]'
            )
        ],
    )

    # 2) Step 1 executor calls get_current_time tool
    step1_tool = make_response(
        "tool_use",
        [make_tool_use_block("tu1", "get_current_time", {"timezone": "UTC"})],
    )
    step1_done = make_response("end_turn", [make_text_block("UTC time captured successfully.")])

    # 3) Step 2 executor calls calculator
    step2_tool = make_response(
        "tool_use",
        [make_tool_use_block("tu2", "calculator", {"expression": "14 ** 2"})],
    )
    step2_done = make_response("end_turn", [make_text_block("Computed square: 196")])

    # 4) Synthesis
    synthesis = make_response("end_turn", [make_text_block("Final: The square is 196.")])

    client.messages.create.side_effect = [
        planner,
        step1_tool,
        step1_done,
        step2_tool,
        step2_done,
        synthesis,
    ]

    result = agent.run("Find UTC hour and square it")
    assert "196" in result


def test_unknown_tool_error_is_handled() -> None:
    client = MagicMock()
    agent = make_agent(client)

    planner = make_response(
        "end_turn",
        [make_text_block('[{"id": 1, "objective": "Call unknown tool"}]')],
    )
    step_tool = make_response(
        "tool_use",
        [make_tool_use_block("tu3", "nonexistent_tool", {"value": "x"})],
    )
    step_done = make_response("end_turn", [make_text_block("Could not run tool, moving on.")])
    synthesis = make_response("end_turn", [make_text_block("Final answer despite tool error.")])

    client.messages.create.side_effect = [planner, step_tool, step_done, synthesis]

    result = agent.run("Do something")
    assert "Final answer" in result


def test_empty_plan_returns_fallback() -> None:
    client = MagicMock()
    agent = make_agent(client)

    planner = make_response("end_turn", [make_text_block("[]")])
    client.messages.create.return_value = planner

    result = agent.run("Unclear request")
    assert "Unable to create a valid plan" in result
