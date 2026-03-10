from __future__ import annotations

import ast
import datetime
import math
import operator
from typing import Callable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def calculator(expression: str) -> str:
    """Safely evaluate a mathematical expression."""
    Number = int | float
    allowed_names: dict[str, Number | Callable[..., Number]] = {
        "abs": abs,
        "round": round,
        "sqrt": math.sqrt,
        "log": math.log,
        "log2": math.log2,
        "log10": math.log10,
        "sin": math.sin,
        "cos": math.cos,
        "tan": math.tan,
        "asin": math.asin,
        "acos": math.acos,
        "atan": math.atan,
        "atan2": math.atan2,
        "ceil": math.ceil,
        "floor": math.floor,
        "pi": math.pi,
        "e": math.e,
        "inf": math.inf,
    }

    allowed_nodes = (
        ast.Expression,
        ast.BinOp,
        ast.UnaryOp,
        ast.Call,
        ast.Constant,
        ast.Name,
        ast.Load,
        ast.Add,
        ast.Sub,
        ast.Mult,
        ast.Div,
        ast.FloorDiv,
        ast.Mod,
        ast.Pow,
        ast.USub,
        ast.UAdd,
    )

    def _safe_eval(node: ast.expr | ast.Expression) -> float | int:
        if isinstance(node, ast.Expression):
            return _safe_eval(node.body)
        if isinstance(node, ast.Constant):
            if not isinstance(node.value, (int, float)):
                raise ValueError(f"Unsupported constant type: {type(node.value)}")
            return node.value
        if isinstance(node, ast.Name):
            if node.id not in allowed_names:
                raise ValueError(f"Unknown name: {node.id!r}")
            value = allowed_names[node.id]
            if callable(value):
                raise ValueError(f"Function {node.id!r} must be called with parentheses")
            return value
        if isinstance(node, ast.BinOp):
            ops: dict[type[ast.operator], Callable[[Number, Number], Number]] = {
                ast.Add: operator.add,
                ast.Sub: operator.sub,
                ast.Mult: operator.mul,
                ast.Div: operator.truediv,
                ast.FloorDiv: operator.floordiv,
                ast.Mod: operator.mod,
                ast.Pow: operator.pow,
            }
            op_fn = ops.get(type(node.op))
            if op_fn is None:
                raise ValueError(f"Unsupported operator: {type(node.op).__name__}")
            return op_fn(_safe_eval(node.left), _safe_eval(node.right))
        if isinstance(node, ast.UnaryOp):
            if isinstance(node.op, ast.USub):
                return -_safe_eval(node.operand)
            if isinstance(node.op, ast.UAdd):
                return +_safe_eval(node.operand)
            raise ValueError(f"Unsupported unary operator: {type(node.op).__name__}")
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise ValueError("Only simple function calls are allowed")
            fn = allowed_names.get(node.func.id)
            if not callable(fn):
                raise ValueError(f"Unknown function: {node.func.id!r}")
            args = [_safe_eval(arg) for arg in node.args]
            return fn(*args)
        raise ValueError(f"Unsupported AST node: {type(node).__name__}")

    try:
        tree = ast.parse(expression.strip(), mode="eval")
        for node in ast.walk(tree):
            if not isinstance(node, allowed_nodes):
                raise ValueError(f"Disallowed expression element: {type(node).__name__}")
        result = _safe_eval(tree)
        if isinstance(result, float) and result.is_integer():
            return str(int(result))
        return str(result)
    except ZeroDivisionError:
        return "Error: Division by zero"
    except (ValueError, TypeError) as exc:
        return f"Error: {exc}"
    except Exception as exc:
        return f"Error evaluating expression: {exc}"


def get_current_time(timezone: str = "UTC") -> str:
    """Return the current date and time in the given timezone."""
    try:
        tz = ZoneInfo(timezone)
        now = datetime.datetime.now(tz)
        return now.strftime("%Y-%m-%d %H:%M:%S %Z (UTC%z)")
    except ZoneInfoNotFoundError:
        return (
            f"Error: Unknown timezone {timezone!r}. "
            "Use IANA names such as 'UTC' or 'America/New_York'."
        )
    except Exception as exc:
        return f"Error getting time: {exc}"


def web_search(query: str) -> str:
    """Simulated web search tool."""
    if not query.strip():
        return "Error: Query cannot be empty"

    simulated_results = [
        {
            "title": f"Search result 1 for: {query}",
            "url": "https://example.com/result1",
            "snippet": f"Simulated result about {query}.",
        },
        {
            "title": f"Search result 2 for: {query}",
            "url": "https://example.com/result2",
            "snippet": f"Another simulated result about {query}.",
        },
    ]

    lines = [f"[SIMULATED] Web search results for: {query!r}", ""]
    for i, result in enumerate(simulated_results, 1):
        lines.append(f"{i}. {result['title']}")
        lines.append(f"   URL: {result['url']}")
        lines.append(f"   {result['snippet']}")
        lines.append("")
    return "\n".join(lines)


TOOL_DEFINITIONS: list[dict[str, object]] = [
    {
        "name": "calculator",
        "description": "Evaluate a mathematical expression.",
        "input_schema": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "Math expression (e.g., '2 ** 10').",
                }
            },
            "required": ["expression"],
        },
    },
    {
        "name": "get_current_time",
        "description": "Get current time in a timezone.",
        "input_schema": {
            "type": "object",
            "properties": {
                "timezone": {
                    "type": "string",
                    "description": "IANA timezone like 'UTC' or 'America/New_York'.",
                }
            },
            "required": [],
        },
    },
    {
        "name": "web_search",
        "description": "Search the web for factual information.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query.",
                }
            },
            "required": ["query"],
        },
    },
]
