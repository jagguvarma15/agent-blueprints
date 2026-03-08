"""
Tool implementations for the ReAct agent blueprint.

Each tool function:
- Accepts keyword arguments matching the tool's input_schema
- Returns a plain string (makes serialisation and logging straightforward)
- Catches exceptions internally and returns an error string rather than raising

TOOL_DEFINITIONS is the registry consumed by the Anthropic Messages API.
"""

from __future__ import annotations

import ast
import datetime
import math
import operator
from typing import Callable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------


def calculator(expression: str) -> str:
    """
    Safely evaluate a mathematical expression and return the result as a string.

    Uses a restricted AST evaluator — no access to builtins, imports, or
    arbitrary code execution. Supports: +, -, *, /, //, %, ** and math
    functions (sqrt, log, sin, cos, tan, abs, round, ceil, floor).

    Args:
        expression: A mathematical expression string, e.g. "2 ** 10" or "sqrt(144)"

    Returns:
        The result as a string, or an error message if evaluation fails.
    """
    # Allowed names in expressions
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

    # Allowed AST node types (whitelist approach)
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
        elif isinstance(node, ast.Constant):
            if not isinstance(node.value, (int, float)):
                raise ValueError(f"Unsupported constant type: {type(node.value)}")
            return node.value
        elif isinstance(node, ast.Name):
            if node.id not in allowed_names:
                raise ValueError(f"Unknown name: {node.id!r}")
            value = allowed_names[node.id]
            if callable(value):
                raise ValueError(f"Function {node.id!r} must be called with parentheses")
            return value
        elif isinstance(node, ast.BinOp):
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
        elif isinstance(node, ast.UnaryOp):
            if isinstance(node.op, ast.USub):
                return -_safe_eval(node.operand)
            elif isinstance(node.op, ast.UAdd):
                return +_safe_eval(node.operand)
            raise ValueError(f"Unsupported unary operator: {type(node.op).__name__}")
        elif isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise ValueError("Only simple function calls are allowed")
            func = allowed_names.get(node.func.id)
            if not callable(func):
                raise ValueError(f"Unknown function: {node.func.id!r}")
            args = [_safe_eval(arg) for arg in node.args]
            return func(*args)
        else:
            raise ValueError(f"Unsupported AST node: {type(node).__name__}")

    try:
        tree = ast.parse(expression.strip(), mode="eval")
        # Validate all nodes before evaluating
        for node in ast.walk(tree):
            if not isinstance(node, allowed_nodes):
                raise ValueError(f"Disallowed expression element: {type(node).__name__}")
        result = _safe_eval(tree)
        # Format integers cleanly, floats with reasonable precision
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
    """
    Return the current date and time in the specified timezone.

    Args:
        timezone: IANA timezone name, e.g. "UTC", "America/New_York", "Europe/London".
                  Defaults to "UTC".

    Returns:
        A human-readable datetime string, or an error message for unknown timezones.
    """
    try:
        tz = ZoneInfo(timezone)
        now = datetime.datetime.now(tz)
        return now.strftime("%Y-%m-%d %H:%M:%S %Z (UTC%z)")
    except ZoneInfoNotFoundError:
        return (
            f"Error: Unknown timezone {timezone!r}. "
            "Use an IANA timezone name such as 'UTC', 'America/New_York', or 'Europe/London'."
        )
    except Exception as exc:
        return f"Error getting time: {exc}"


def web_search(query: str) -> str:
    """
    Perform a web search and return results.

    NOTE: This is a simulated implementation that returns placeholder results.
    To use real search, replace this function body with an actual search API
    integration (e.g. Brave Search, Tavily, SerpAPI, or Exa).

    Example with Tavily:
        from tavily import TavilyClient
        client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])
        results = client.search(query=query, max_results=3)
        return "\\n".join(r["content"] for r in results["results"])

    Args:
        query: The search query string.

    Returns:
        Simulated search results as a formatted string.
    """
    # Simulated results — replace with real search API integration
    simulated_results = [
        {
            "title": f"Search result 1 for: {query}",
            "url": "https://example.com/result1",
            "snippet": (
                f"This is a simulated search result for '{query}'. "
                "In a real implementation, this would contain actual web content "
                "retrieved from a search API such as Brave, Tavily, or SerpAPI."
            ),
        },
        {
            "title": f"Search result 2 for: {query}",
            "url": "https://example.com/result2",
            "snippet": (
                f"Another simulated result for '{query}'. "
                "Replace the web_search function in tools.py with a real search "
                "integration to get actual results."
            ),
        },
    ]

    lines = [f"[SIMULATED] Web search results for: {query!r}\n"]
    for i, result in enumerate(simulated_results, 1):
        lines.append(f"{i}. {result['title']}")
        lines.append(f"   URL: {result['url']}")
        lines.append(f"   {result['snippet']}")
        lines.append("")
    lines.append(
        "Note: These are simulated results. "
        "See tools.py web_search() for instructions on adding real search."
    )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Tool definitions (Anthropic tool format)
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS: list[dict[str, object]] = [
    {
        "name": "calculator",
        "description": (
            "Evaluate a mathematical expression and return the numeric result. "
            "Supports arithmetic operators (+, -, *, /, //, %, **) and common math "
            "functions: sqrt, log, log2, log10, sin, cos, tan, asin, acos, atan, "
            "atan2, ceil, floor, abs, round. Constants: pi, e. "
            "Example expressions: '2 ** 10', 'sqrt(144)', '(15 + 7) * 3 / 2', "
            "'log(100, 10)'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": (
                        "The mathematical expression to evaluate. "
                        "Use standard Python math syntax. "
                        "Examples: '2 + 2', 'sqrt(16)', '100 / 7', '2 ** 32'."
                    ),
                }
            },
            "required": ["expression"],
        },
    },
    {
        "name": "get_current_time",
        "description": (
            "Get the current date and time in a specified timezone. "
            "Useful when the user asks about the current time, today's date, "
            "or needs to know the time in a specific location."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "timezone": {
                    "type": "string",
                    "description": (
                        "IANA timezone name. Examples: 'UTC', 'America/New_York', "
                        "'Europe/London', 'Asia/Tokyo', 'Australia/Sydney'. "
                        "Defaults to UTC if not specified."
                    ),
                }
            },
            "required": [],
        },
    },
    {
        "name": "web_search",
        "description": (
            "Search the web for current information about a topic. "
            "Use this when you need up-to-date information, facts you're uncertain about, "
            "or details about recent events. Returns a list of relevant search results "
            "with titles, URLs, and snippets."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": (
                        "The search query. Be specific and concise for best results. "
                        "Example: 'population of Tokyo 2024' rather than 'Tokyo'."
                    ),
                }
            },
            "required": ["query"],
        },
    },
]
