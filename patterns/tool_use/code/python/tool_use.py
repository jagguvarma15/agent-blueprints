"""
Tool Use — Structured function calling with schema-validated dispatch.

The LLM is given JSON schemas describing available tools. It responds
with a structured tool call (name + arguments). The dispatcher validates,
routes, executes, and injects the result back into the conversation.

Design doc:  ../../design.md
Overview:    ../../overview.md
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable, Protocol


# ── Interfaces ────────────────────────────────────────────────────────────────

class LLM(Protocol):
    def generate(self, messages: list[dict], tools: list[dict] | None = None) -> str: ...


# ── Core types ────────────────────────────────────────────────────────────────

@dataclass
class Tool:
    name: str
    description: str
    parameters: dict        # JSON Schema for the parameters object
    fn: Callable[..., Any]

    def to_schema(self) -> dict:
        """OpenAI-compatible tool schema format."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    def run(self, arguments: dict) -> str:
        result = self.fn(**arguments)
        return json.dumps(result) if not isinstance(result, str) else result


@dataclass
class ToolCall:
    name: str
    arguments: dict


@dataclass
class Turn:
    role: str           # "user" | "assistant" | "tool"
    content: str
    tool_call: ToolCall | None = None
    tool_name: str | None = None


@dataclass
class ToolUseResult:
    final_response: str
    turns: list[Turn] = field(default_factory=list)
    tool_calls_made: int = 0


# ── Implementation ────────────────────────────────────────────────────────────

class ToolUseAgent:
    """
    Single-turn or multi-turn LLM with structured tool calling.

    The agent runs until the LLM produces a plain text response (no tool call),
    or until max_rounds is reached.
    """

    def __init__(
        self,
        llm: LLM,
        tools: list[Tool],
        system: str = "",
        max_rounds: int = 5,
    ):
        self.llm = llm
        self.tools: dict[str, Tool] = {t.name: t for t in tools}
        self.tool_schemas = [t.to_schema() for t in tools]
        self.system = system
        self.max_rounds = max_rounds

    def _parse_tool_call(self, response: str) -> ToolCall | None:
        """
        Parse a tool call from the LLM response.
        Expects JSON: {"tool": "name", "arguments": {...}}
        Real LLM providers return this in a structured field, not inline text.
        This parser handles the text-based fallback.
        """
        try:
            data = json.loads(response)
            if "tool" in data and "arguments" in data:
                return ToolCall(name=data["tool"], arguments=data["arguments"])
        except (json.JSONDecodeError, KeyError):
            pass
        return None

    def run(self, user_message: str) -> ToolUseResult:
        messages: list[dict] = []
        if self.system:
            messages.append({"role": "system", "content": self.system})
        messages.append({"role": "user", "content": user_message})

        turns: list[Turn] = [Turn(role="user", content=user_message)]
        tool_calls_made = 0

        for _ in range(self.max_rounds):
            response = self.llm.generate(messages, tools=self.tool_schemas)
            tool_call = self._parse_tool_call(response)

            if tool_call is None:
                # No tool call — final response
                turns.append(Turn(role="assistant", content=response))
                return ToolUseResult(
                    final_response=response,
                    turns=turns,
                    tool_calls_made=tool_calls_made,
                )

            # Execute tool
            tool = self.tools.get(tool_call.name)
            tool_result = tool.run(tool_call.arguments) if tool else f"Unknown tool: {tool_call.name}"
            tool_calls_made += 1

            turns.append(Turn(role="assistant", content=response, tool_call=tool_call))
            turns.append(Turn(role="tool", content=tool_result, tool_name=tool_call.name))

            # Inject result back into conversation
            messages.append({"role": "assistant", "content": response})
            messages.append({"role": "tool", "content": tool_result, "name": tool_call.name})

        return ToolUseResult(
            final_response="Reached max tool call rounds.",
            turns=turns,
            tool_calls_made=tool_calls_made,
        )


# ── Example ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":

    class MockLLM:
        def __init__(self):
            self._round = 0

        def generate(self, messages: list[dict], tools: list[dict] | None = None) -> str:
            self._round += 1
            if self._round == 1:
                return json.dumps({"tool": "get_weather", "arguments": {"city": "Tokyo"}})
            return "The current weather in Tokyo is 22°C and partly cloudy."

    agent = ToolUseAgent(
        llm=MockLLM(),
        system="You are a helpful assistant with access to real-time tools.",
        tools=[
            Tool(
                name="get_weather",
                description="Get current weather for a city",
                parameters={
                    "type": "object",
                    "properties": {
                        "city": {"type": "string", "description": "City name"},
                    },
                    "required": ["city"],
                },
                fn=lambda city: {"temperature": 22, "condition": "partly cloudy", "city": city},
            ),
            Tool(
                name="calculate",
                description="Evaluate a mathematical expression",
                parameters={
                    "type": "object",
                    "properties": {
                        "expression": {"type": "string"},
                    },
                    "required": ["expression"],
                },
                fn=lambda expression: eval(expression),  # noqa: S307
            ),
        ],
    )

    result = agent.run("What's the weather in Tokyo right now?")
    print(f"Tool calls made: {result.tool_calls_made}")
    print(f"Final response: {result.final_response}")
