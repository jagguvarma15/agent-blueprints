"""
Compact-Error Retry — bounded retry that feeds a compacted error back.

When a tool call raises, the naive moves are to surface a full stack trace or to
loop forever. This wrapper instead catches the failure, compacts it to a short,
model-readable summary, and retries up to a fixed budget — then returns a
``ToolResult`` carrying the compacted error so the agent self-corrects or
reports cleanly instead of crashing. Bounded by design: ``max_attempts`` caps
the loop so a persistently-failing tool can't spin.

Design doc:  ../../design.md
Overview:    ../../overview.md
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from primitives.tool_use.schemas.state import ToolCall, ToolResult

# ── Core types ────────────────────────────────────────────────────────────────

_MAX_ERROR_CHARS = 280


def compact_error(exc: Exception) -> str:
    """Reduce an exception to a short, model-readable one-liner.

    Keeps the type and message, collapses newlines, and truncates — enough for
    the model to adjust its next call without flooding the context window.
    """
    summary = f"{type(exc).__name__}: {exc}".replace("\n", " ").strip()
    if len(summary) > _MAX_ERROR_CHARS:
        summary = summary[: _MAX_ERROR_CHARS - 1] + "…"
    return summary


@dataclass
class RetryReport:
    """Outcome of a guarded tool execution."""

    result: ToolResult
    attempts: int
    errors: list[str]


# ── Implementation ────────────────────────────────────────────────────────────


def run_with_retry(
    call: ToolCall,
    execute: Callable[[ToolCall], str],
    *,
    max_attempts: int = 3,
) -> RetryReport:
    """Run ``execute(call)``, retrying on exception with a compacted error.

    On success the returned :class:`ToolResult` carries the tool output; after
    ``max_attempts`` failures it carries the last compacted error (with
    ``ToolResult.error`` set), so the caller injects a clean failure into the
    conversation instead of raising.
    """
    errors: list[str] = []
    for attempt in range(1, max_attempts + 1):
        try:
            output = execute(call)
        except Exception as exc:
            errors.append(compact_error(exc))
            continue
        return RetryReport(
            result=ToolResult(tool=call.tool, output=output, id=call.id),
            attempts=attempt,
            errors=errors,
        )
    last_error = errors[-1] if errors else "unknown error"
    return RetryReport(
        result=ToolResult(tool=call.tool, output=last_error, error=last_error, id=call.id),
        attempts=max_attempts,
        errors=errors,
    )


# ── Example ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    _seen = {"n": 0}

    def flaky(call: ToolCall) -> str:
        _seen["n"] += 1
        if _seen["n"] < 2:
            raise ConnectionError("upstream 503\nretry later")
        return "ok: fetched 3 rows"

    recovered = run_with_retry(ToolCall(tool="fetch", args={}), flaky, max_attempts=3)
    print(f"recovered: attempts={recovered.attempts} output={recovered.result.output!r}")

    def broken(call: ToolCall) -> str:
        raise ValueError("bad input")

    failed = run_with_retry(ToolCall(tool="broken", args={}), broken, max_attempts=2)
    print(f"failed: attempts={failed.attempts} error={failed.result.error!r}")
