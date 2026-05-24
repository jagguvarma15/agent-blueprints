"""
Human in the Loop — Propose, pause, surface to an approver, resume on decision.

A minimal illustrative approval gate. Three approver-surface flavours
(in-memory CLI / "Slack" stand-in / web-queue stand-in), TTL with three
escalation policies (auto-approve / auto-deny / escalate), and an
idempotent decision handler.

Real projects layer durable pending storage (Postgres + LangGraph
checkpointer) and a real surface (Slack webhook, FastAPI endpoint) on
top; this example keeps everything in-process to focus on the gate
contract.

Design doc:  ../../design.md
Overview:    ../../overview.md
"""
from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Literal, Protocol


# ── Core types ────────────────────────────────────────────────────────────────


@dataclass
class Approval:
    """A request for a human decision before an action commits.

    ``ttl_seconds`` defaults to ``None`` so the gate's configured
    ``timeout_seconds`` applies. Set it per-approval only when a specific
    proposal needs a tighter or looser deadline than the gate's default.
    """

    proposal_id: str
    action: str
    context: dict
    approver_pool: str
    ttl_seconds: int | None = None
    on_timeout: Literal["auto_approve", "auto_deny", "escalate"] = "escalate"


DecisionOutcome = Literal["approved", "denied", "modified", "timed_out"]


@dataclass
class Decision:
    proposal_id: str
    outcome: DecisionOutcome
    approver: str
    decided_at: float
    decided_in_seconds: float
    reason: str | None = None
    modification: dict | None = None
    escalation_level: int = 0


@dataclass
class AuditEntry:
    proposal_id: str
    surface: str
    action: str
    context_shown: dict
    approver: str
    outcome: DecisionOutcome
    decided_at: float
    decided_in_seconds: float
    escalation_level: int
    modification: dict | None = None
    reason: str | None = None


# ── Surface protocol ──────────────────────────────────────────────────────────


class Surface(Protocol):
    """A surface delivers a proposal to an approver and accepts their decision."""

    name: str

    def deliver(self, approval: Approval, escalation_level: int) -> None: ...


# ── Implementations of three surfaces ─────────────────────────────────────────


@dataclass
class CLISurface:
    """For dev / tests — auto-responds via a registered handler."""

    name: str = "cli"
    responder: Callable[[Approval], dict] | None = None

    def deliver(self, approval: Approval, escalation_level: int) -> None:
        # In a real CLI surface this prints to stderr and blocks on input(). For
        # the demo we use a programmable responder so scenarios are deterministic.
        if self.responder is None:
            raise RuntimeError("CLISurface needs a responder for tests")
        decision_payload = self.responder(approval)
        ApprovalGate.global_inbox.put(approval.proposal_id, decision_payload, escalation_level)


@dataclass
class SlackSurface:
    """Stand-in for a real Slack webhook. Records deliveries; a separate test
    helper feeds decisions back via ``ApprovalGate.global_inbox``."""

    channel: str
    name: str = "slack"
    deliveries: list[tuple[str, int]] = field(default_factory=list)

    def deliver(self, approval: Approval, escalation_level: int) -> None:
        self.deliveries.append((approval.proposal_id, escalation_level))


@dataclass
class WebQueueSurface:
    """Stand-in for a web admin queue. Pending proposals readable via the
    ``pending`` list; a test helper resolves them."""

    name: str = "web_queue"
    pending: list[Approval] = field(default_factory=list)
    deliveries: list[tuple[str, int]] = field(default_factory=list)

    def deliver(self, approval: Approval, escalation_level: int) -> None:
        self.pending.append(approval)
        self.deliveries.append((approval.proposal_id, escalation_level))

    def resolve(self, proposal_id: str, **decision_payload: Any) -> None:
        self.pending = [p for p in self.pending if p.proposal_id != proposal_id]
        ApprovalGate.global_inbox.put(proposal_id, decision_payload, escalation_level=0)


# ── In-memory inbox for decisions ─────────────────────────────────────────────


class _DecisionInbox:
    """Thread-safe holding pen for decisions submitted out-of-band by surfaces.

    First-decision-wins idempotency: once a decision has been ``put`` (and
    later ``take``‑n by the gate), any subsequent ``put`` for the same
    proposal_id returns ``False`` so duplicate webhook deliveries don't
    second-guess the original decision.

    Production replacement: a Postgres row keyed on proposal_id with an
    ``UPDATE ... WHERE state = 'pending'`` write, or a Redis SETNX-style
    claim, behind a real webhook handler.
    """

    def __init__(self) -> None:
        self._decisions: dict[str, tuple[dict, int]] = {}
        self._consumed: set[str] = set()
        self._lock = threading.Lock()

    def put(self, proposal_id: str, payload: dict, escalation_level: int) -> bool:
        with self._lock:
            if proposal_id in self._decisions or proposal_id in self._consumed:
                return False           # first decision wins (idempotent)
            self._decisions[proposal_id] = (payload, escalation_level)
            return True

    def take(self, proposal_id: str) -> tuple[dict, int] | None:
        with self._lock:
            slot = self._decisions.pop(proposal_id, None)
            if slot is not None:
                self._consumed.add(proposal_id)
            return slot


# ── Approval gate ─────────────────────────────────────────────────────────────


class ApprovalGate:
    """
    The gate the agent calls into. Handles surface delivery, TTL + escalation,
    decision capture, and audit appending. Production gates persist proposals
    + decisions in a real store; this example keeps them in-memory.
    """

    global_inbox: _DecisionInbox = _DecisionInbox()

    def __init__(
        self,
        surface: Surface,
        timeout_seconds: int = 900,
        on_timeout: Literal["auto_approve", "auto_deny", "escalate"] = "escalate",
        escalation_surface: Surface | None = None,
        poll_interval_seconds: float = 0.05,
    ):
        self.surface = surface
        self.timeout_seconds = timeout_seconds
        self.on_timeout = on_timeout
        self.escalation_surface = escalation_surface
        self.poll_interval = poll_interval_seconds
        self.audit: list[AuditEntry] = []

    def request_approval(self, approval: Approval) -> Decision:
        """Synchronously block until a decision arrives or the TTL fires."""
        started_at = time.monotonic()
        escalation_level = 0
        active_surface = self.surface
        ttl = approval.ttl_seconds if approval.ttl_seconds is not None else self.timeout_seconds
        active_surface.deliver(approval, escalation_level)

        while True:
            slot = self.global_inbox.take(approval.proposal_id)
            if slot is not None:
                payload, _level = slot
                decision = self._build_decision(
                    approval, payload, started_at, escalation_level,
                )
                self._append_audit(approval, active_surface, decision)
                return decision

            elapsed = time.monotonic() - started_at
            if elapsed < ttl:
                time.sleep(self.poll_interval)
                continue

            # TTL fired — apply the policy.
            if approval.on_timeout == "escalate" and self.escalation_surface is not None and escalation_level == 0:
                escalation_level += 1
                active_surface = self.escalation_surface
                started_at = time.monotonic()    # reset clock for the new surface
                active_surface.deliver(approval, escalation_level)
                continue

            outcome: DecisionOutcome
            if approval.on_timeout == "auto_approve":
                outcome = "approved"
            elif approval.on_timeout == "auto_deny":
                outcome = "denied"
            else:
                outcome = "timed_out"
            decision = Decision(
                proposal_id=approval.proposal_id,
                outcome=outcome,
                approver="system:ttl_expired",
                decided_at=time.time(),
                decided_in_seconds=time.monotonic() - started_at,
                reason=f"ttl_expired_after_{ttl}s",
                escalation_level=escalation_level,
            )
            self._append_audit(approval, active_surface, decision)
            return decision

    def _build_decision(
        self,
        approval: Approval,
        payload: dict,
        started_at: float,
        escalation_level: int,
    ) -> Decision:
        return Decision(
            proposal_id=approval.proposal_id,
            outcome=payload.get("outcome", "approved"),
            approver=payload.get("approver", "unknown"),
            decided_at=time.time(),
            decided_in_seconds=time.monotonic() - started_at,
            reason=payload.get("reason"),
            modification=payload.get("modification"),
            escalation_level=escalation_level,
        )

    def _append_audit(self, approval: Approval, surface: Surface, decision: Decision) -> None:
        self.audit.append(AuditEntry(
            proposal_id=approval.proposal_id,
            surface=surface.name,
            action=approval.action,
            context_shown=approval.context,
            approver=decision.approver,
            outcome=decision.outcome,
            decided_at=decision.decided_at,
            decided_in_seconds=decision.decided_in_seconds,
            escalation_level=decision.escalation_level,
            modification=decision.modification,
            reason=decision.reason,
        ))


# ── Example ───────────────────────────────────────────────────────────────────


if __name__ == "__main__":
    import json

    def fresh_gate(**overrides: Any) -> ApprovalGate:
        # Reset the global inbox between scenarios so they don't leak state.
        ApprovalGate.global_inbox = _DecisionInbox()
        return ApprovalGate(**overrides)

    # Scenario 1: CLI surface, immediate approval.
    cli = CLISurface(
        responder=lambda a: {"outcome": "approved", "approver": "ops_alice"},
    )
    gate = fresh_gate(surface=cli, timeout_seconds=2, on_timeout="auto_deny")
    decision = gate.request_approval(Approval(
        proposal_id="rebook:vip_001",
        action="rebook_reservation",
        context={"customer": "cust_7", "tier": "vip", "value_usd": 245},
        approver_pool="restaurant_staff",
    ))
    print("=== Scenario 1: CLI surface, immediate approval ===")
    print(json.dumps({
        "outcome": decision.outcome,
        "approver": decision.approver,
        "audit_count": len(gate.audit),
    }, indent=2))

    # Scenario 2: Slack surface with TTL + auto-deny escalation policy (no escalation surface).
    slack = SlackSurface(channel="#rebooking-approvals")
    gate = fresh_gate(surface=slack, timeout_seconds=0.3, on_timeout="auto_deny")
    decision = gate.request_approval(Approval(
        proposal_id="rebook:routine_002",
        action="rebook_reservation",
        context={"customer": "cust_9", "tier": "standard", "value_usd": 60},
        approver_pool="restaurant_staff",
        on_timeout="auto_deny",
    ))
    print("\n=== Scenario 2: Slack delivered, no response, TTL → auto_deny ===")
    print(json.dumps({
        "outcome": decision.outcome,
        "approver": decision.approver,
        "reason": decision.reason,
        "deliveries": slack.deliveries,
    }, indent=2))

    # Scenario 3: Slack with TTL + escalate-to-web-queue policy.
    slack = SlackSurface(channel="#rebooking-approvals")
    web = WebQueueSurface()
    gate = fresh_gate(
        surface=slack,
        timeout_seconds=0.2,
        on_timeout="escalate",
        escalation_surface=web,
    )
    # Spawn a deferred resolver that approves via the web queue 0.3s in.
    def resolve_later() -> None:
        time.sleep(0.3)
        web.resolve(
            proposal_id="rebook:manager_003",
            outcome="modified",
            approver="manager_bob",
            modification={"chosen_candidate_index": 1},
        )
    threading.Thread(target=resolve_later, daemon=True).start()
    decision = gate.request_approval(Approval(
        proposal_id="rebook:manager_003",
        action="rebook_reservation",
        context={"customer": "cust_11", "tier": "vip", "value_usd": 1200},
        approver_pool="restaurant_staff",
        on_timeout="escalate",
    ))
    print("\n=== Scenario 3: Slack TTL → escalate to web queue, then approver modifies ===")
    print(json.dumps({
        "outcome": decision.outcome,
        "approver": decision.approver,
        "escalation_level": decision.escalation_level,
        "modification": decision.modification,
        "slack_deliveries": slack.deliveries,
        "web_deliveries": web.deliveries,
    }, indent=2))

    # Scenario 4: idempotent double-decision (race).
    cli = CLISurface(
        responder=lambda a: {"outcome": "approved", "approver": "ops_alice"},
    )
    gate = fresh_gate(surface=cli, timeout_seconds=2, on_timeout="auto_deny")
    proposal = Approval(
        proposal_id="rebook:race_004",
        action="rebook_reservation",
        context={"customer": "cust_13", "tier": "standard"},
        approver_pool="restaurant_staff",
    )
    # First decision lands via the responder. Now an out-of-band second decision
    # tries to land — the inbox should reject it (first writer wins).
    decision = gate.request_approval(proposal)
    second_landed = ApprovalGate.global_inbox.put(
        proposal.proposal_id,
        {"outcome": "denied", "approver": "ops_bob"},
        escalation_level=0,
    )
    print("\n=== Scenario 4: Idempotent race — second decision rejected ===")
    print(json.dumps({
        "first_outcome": decision.outcome,
        "first_approver": decision.approver,
        "second_landed": second_landed,
    }, indent=2))
