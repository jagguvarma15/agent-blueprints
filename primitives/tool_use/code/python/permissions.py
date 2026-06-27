"""
Tool Permissions — Always / Ask / Never gating for tool execution.

Each registered tool carries a permission tier. The gate consults it before any
tool runs: ALWAYS executes silently, ASK routes to a human-approval callback
(the human-in-the-loop seam), and NEVER refuses outright. This is the hard
boundary that stops an agent invoking a destructive tool without a human in the
loop — the permission model the production-agent literature treats as
load-bearing. Unclassified tools default to ASK: fail safe, never silently run.

Design doc:  ../../design.md
Overview:    ../../overview.md
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Protocol

from primitives.tool_use.schemas.state import ToolCall

# ── Core types ────────────────────────────────────────────────────────────────


class Permission(str, Enum):
    """How a tool may be invoked."""

    ALWAYS = "always"  # run without asking
    ASK = "ask"  # require human approval first
    NEVER = "never"  # refuse outright


@dataclass
class PermissionDecision:
    """The outcome of gating one tool call."""

    allowed: bool
    permission: Permission
    reason: str = ""


# ── Interfaces ────────────────────────────────────────────────────────────────


class ApprovalPrompt(Protocol):
    """Asks a human to approve one ASK-tier tool call; returns True to allow."""

    def __call__(self, call: ToolCall, reason: str) -> bool: ...


# ── Implementation ────────────────────────────────────────────────────────────


class PermissionGate:
    """Maps tool name → :class:`Permission` and decides whether a call may run.

    A tool absent from the map falls back to ``default`` (ASK) — a tool nobody
    classified is treated as needing approval, never silently allowed.
    """

    def __init__(
        self,
        permissions: dict[str, Permission],
        *,
        approve: ApprovalPrompt | None = None,
        default: Permission = Permission.ASK,
    ) -> None:
        self._permissions = dict(permissions)
        self._approve = approve
        self._default = default

    def permission_for(self, tool: str) -> Permission:
        return self._permissions.get(tool, self._default)

    def check(self, call: ToolCall) -> PermissionDecision:
        permission = self.permission_for(call.tool)
        if permission is Permission.ALWAYS:
            return PermissionDecision(True, permission, "allowed (ALWAYS)")
        if permission is Permission.NEVER:
            return PermissionDecision(False, permission, f"tool {call.tool!r} denied (NEVER)")
        reason = f"tool {call.tool!r} requires approval"
        if self._approve is None:
            return PermissionDecision(False, permission, f"{reason} but no approver configured")
        approved = self._approve(call, reason)
        verdict = "approved" if approved else "declined"
        return PermissionDecision(approved, permission, f"{reason} — {verdict}")


# ── Example ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    gate = PermissionGate(
        {
            "get_weather": Permission.ALWAYS,
            "delete_file": Permission.NEVER,
            "send_email": Permission.ASK,
        },
        approve=lambda call, reason: call.args.get("to") == "team@example.com",
    )
    samples = [
        ("get_weather", {"city": "Tokyo"}),
        ("delete_file", {"path": "/etc/passwd"}),
        ("send_email", {"to": "team@example.com"}),
        ("send_email", {"to": "stranger@example.net"}),
    ]
    for name, args in samples:
        decision = gate.check(ToolCall(tool=name, args=args))
        print(f"{name}: allowed={decision.allowed} — {decision.reason}")
