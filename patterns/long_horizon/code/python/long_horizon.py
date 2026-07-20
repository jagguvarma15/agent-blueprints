"""
Long-Horizon — checkpoint-and-resume task execution across crashes and waits.

A minimal illustrative runtime for the contract in ``../../implementation.md``:
the *tick* is the unit of work (load checkpoint, replay events since, advance
by at most one step, persist checkpoint + events atomically), any worker can
resume any task, re-planning happens only when the executor asks, and every
side-effecting step carries a stable idempotency key.

The store here is in-memory with a transaction lock — the operational shape
of the documented Postgres pairing (checkpoint snapshot + append-only event
log committing together) without the database, so this file runs end to end
with no services and no keys. The planner sits behind a seam; the stub emits
a fixed plan (the live version is a planner-class LLM call — see the prompts
directory).

Demo at the bottom: a three-step task ticks to a wait, receives an external
signal, survives a simulated worker crash (state dropped, reloaded from the
checkpoint), and completes — printing the event log that made it replayable.

Design doc:  ../../design.md
Overview:    ../../overview.md
"""

from __future__ import annotations

import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Protocol

from patterns.long_horizon.schemas.state import (
    Checkpoint,
    EventLogEntry,
    LongHorizonState,
    Plan,
    StepRecord,
)

TERMINAL = ("completed", "aborted", "requires_human", "deadline_exceeded")


# ── Store ─────────────────────────────────────────────────────────────────────
#
# The documented default is Postgres with the checkpoint row and the event
# rows in one transaction. This in-memory stand-in keeps the same contract:
# ``transaction`` takes the per-store lock, and ``persist`` writes snapshot
# plus events together or not at all.


class CheckpointStore(Protocol):
    def load(self, task_id: str) -> tuple[LongHorizonState, list[EventLogEntry]]: ...
    def persist(self, state: LongHorizonState, events: list[EventLogEntry]) -> None: ...


@dataclass
class InMemoryStore:
    """Checkpoint + event log with transactional pairing (a lock)."""

    checkpoints: dict[str, Checkpoint] = field(default_factory=dict)
    events: dict[str, list[EventLogEntry]] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def transaction(self) -> threading.Lock:
        return self._lock

    def load(self, task_id: str) -> tuple[LongHorizonState, list[EventLogEntry]]:
        """The latest snapshot plus every event logged after it."""
        checkpoint = self.checkpoints[task_id]
        since = [e for e in self.events.get(task_id, []) if e.seq > checkpoint.version]
        # model_copy(deep=True): the caller mutates its copy; the stored
        # snapshot stays pristine until the next persist.
        return checkpoint.state.model_copy(deep=True), since

    def persist(self, state: LongHorizonState, events: list[EventLogEntry]) -> None:
        log = self.events.setdefault(state.task_id, [])
        log.extend(events)
        version = log[-1].seq if log else 0
        self.checkpoints[state.task_id] = Checkpoint(task_id=state.task_id, version=version, state=state)

    def append_events(self, task_id: str, events: list[EventLogEntry]) -> None:
        """Out-of-band append — the log only, NO snapshot.

        This is how external signals arrive: the signal writer never holds
        the task state, so it must not write a checkpoint (snapshotting a
        state the signal was never applied to would absorb the event into
        the version watermark unseen). The next tick replays it.
        """
        self.events.setdefault(task_id, []).extend(events)

    def next_seq(self, task_id: str) -> int:
        log = self.events.get(task_id, [])
        return (log[-1].seq + 1) if log else 1


# ── Executor + planner seams ──────────────────────────────────────────────────


@dataclass
class StepResult:
    """What one step execution produced."""

    ok: bool
    data: dict[str, object] = field(default_factory=dict)
    error: str | None = None
    waiting: bool = False
    """True when the step is blocked on an external signal — the tick
    persists and returns; a later signal flips the step back to pending."""
    replan_reason: str | None = None
    """Set when the result implies the plan is stale; the runner replans
    once, on request — never per step (planner calls are expensive)."""


Executor = Callable[[StepRecord, LongHorizonState], StepResult]
Planner = Callable[[str], Plan]
"""goal -> Plan. The live implementation is a planner-class LLM call; the
demo stub emits a fixed plan so this file runs offline."""


def idempotency_key(state: LongHorizonState, step: StepRecord) -> str:
    """Stable key downstream systems use to deduplicate retried side effects."""
    return f"{state.task_id}:{step.step_id}:{step.attempt}"


# ── Event application ─────────────────────────────────────────────────────────


def apply_events(state: LongHorizonState, events: list[EventLogEntry]) -> LongHorizonState:
    """Fold events logged after the snapshot into the state (the replay half
    of resume). Only externally-originated kinds matter here — everything the
    tick itself does is already inside the snapshot it persists. A signal
    completes the wait step it targets: the step's job was to wait, and the
    signal is the thing it waited for (the payload lands as the result)."""
    for entry in events:
        if entry.kind == "external_signal_received":
            step_id = entry.payload.get("step_id")
            for step in state.plan.steps:
                if step.step_id == step_id and step.status == "in_progress":
                    step.status = "completed"
                    step.completed_at = entry.occurred_at
                    step.result = {k: v for k, v in entry.payload.items() if k != "step_id"}
    return state


class _EventFactory:
    """Seq-correct event construction for one transaction.

    ``store.next_seq`` reads the persisted tail, so building several events
    before one persist would hand every one the same seq — this cursor
    advances locally and only resets when the transaction commits.
    """

    def __init__(self, store: InMemoryStore, task_id: str) -> None:
        self._task_id = task_id
        self._seq = store.next_seq(task_id)

    def __call__(self, kind: str, **payload: object) -> EventLogEntry:
        entry = EventLogEntry(
            task_id=self._task_id,
            seq=self._seq,
            kind=kind,  # type: ignore[arg-type]
            payload=payload,
        )
        self._seq += 1
        return entry


# ── The tick ──────────────────────────────────────────────────────────────────


def start_task(store: InMemoryStore, task_id: str, goal: str, planner: Planner) -> None:
    """Create the task: plan once, persist the first checkpoint."""
    with store.transaction():
        state = LongHorizonState(task_id=task_id, goal=goal, status="in_progress")
        state.started_at = datetime.now(UTC)
        state.plan = planner(goal)
        event = _EventFactory(store, task_id)
        store.persist(
            state,
            [
                event("task_started", goal=goal),
                event("plan_emitted", steps=len(state.plan.steps)),
            ],
        )


def tick(
    store: InMemoryStore,
    task_id: str,
    executor: Executor,
    planner: Planner,
    *,
    worker_id: str = "worker-1",
) -> LongHorizonState:
    """Advance the task by at most one step and persist atomically.

    The documented loop: load + replay, terminal check, deadline check, next
    pending step, execute, persist checkpoint + events together. A waiting
    step persists as in_progress and the tick returns — a later external
    signal flips it back to pending for the next tick.
    """
    with store.transaction():
        state, since = store.load(task_id)
        state = apply_events(state, since)
        state.last_tick_at = datetime.now(UTC)
        state.last_worker_id = worker_id
        event = _EventFactory(store, task_id)

        if state.status in TERMINAL:
            return state

        if state.deadline_at is not None and datetime.now(UTC) > state.deadline_at:
            state.status = "deadline_exceeded"
            store.persist(state, [event("task_deadline_exceeded")])
            return state

        step = state.plan.next_pending_step()
        if step is None:
            if any(s.status == "in_progress" for s in state.plan.steps):
                store.persist(state, [])  # waiting on a signal — nothing to run
                return state
            state.status = "completed"
            state.completed_at = datetime.now(UTC)
            store.persist(state, [event("task_completed")])
            return state

        step.status = "in_progress"
        step.attempt += 1
        step.started_at = datetime.now(UTC)
        step.idempotency_key = idempotency_key(state, step)
        events = [event("step_started", step_id=step.step_id)]

        result = executor(step, state)

        if result.waiting:
            # Blocked on the outside world: stay in_progress, persist, return.
            store.persist(state, events)
            return state
        if result.ok:
            step.status = "completed"
            step.completed_at = datetime.now(UTC)
            step.result = dict(result.data)
            events.append(event("step_completed", step_id=step.step_id))
        else:
            step.status = "failed"
            step.error = result.error
            events.append(event("step_failed", step_id=step.step_id, error=result.error))

        if result.replan_reason:
            # Replan only on explicit request — planner calls are expensive.
            state.plan = planner(state.goal)
            state.replan_count += 1
            events.append(event("replanned", reason=result.replan_reason))

        store.persist(state, events)
        return state


def resume(store: InMemoryStore, task_id: str) -> LongHorizonState:
    """What a fresh worker does after a crash: load, replay, count the resume."""
    with store.transaction():
        state, since = store.load(task_id)
        state = apply_events(state, since)
        state.resume_count += 1
        store.persist(state, [])
        return state


# ── Offline demo ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    store = InMemoryStore()

    def stub_planner(goal: str) -> Plan:
        return Plan(
            version=1,
            steps=[
                StepRecord(step_id="draft", kind="llm", description="Draft the report"),
                StepRecord(
                    step_id="review",
                    kind="wait_for_signal",
                    description="Wait for editorial sign-off",
                ),
                StepRecord(step_id="publish", kind="tool", description="Publish the report"),
            ],
        )

    def stub_executor(step: StepRecord, state: LongHorizonState) -> StepResult:
        if step.kind == "wait_for_signal":
            return StepResult(ok=False, waiting=True)
        return StepResult(ok=True, data={"note": f"{step.step_id} done"})

    start_task(store, "task-1", "Publish the weekly report", stub_planner)

    tick(store, "task-1", stub_executor, stub_planner)  # draft completes
    tick(store, "task-1", stub_executor, stub_planner)  # review starts waiting

    # The outside world signs off: the signal writer appends to the event
    # log only — no checkpoint (it never held the state). The next tick's
    # replay applies it, completing the wait step.
    signal = _EventFactory(store, "task-1")
    store.append_events("task-1", [signal("external_signal_received", step_id="review", approver="editor")])

    # Simulated crash: the in-memory state above is gone; a fresh worker
    # resumes purely from the checkpoint + events.
    state = resume(store, "task-1")
    state = tick(store, "task-1", stub_executor, stub_planner, worker_id="worker-2")
    state = tick(store, "task-1", stub_executor, stub_planner, worker_id="worker-2")
    state = tick(store, "task-1", stub_executor, stub_planner, worker_id="worker-2")

    print(f"status={state.status} resumes={state.resume_count} steps_done={state.completed_steps_count}")
    for entry in store.events["task-1"]:
        print(f"  {entry.seq:>2} {entry.kind}")
