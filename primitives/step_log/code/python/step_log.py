"""Step Log — framework-agnostic reference implementation.

A run's state as an append-only event log. The recorder brackets each step
(``start`` -> ``finish``) and appends one event per transition; ``replay`` folds
the events back into per-step status, so a resume re-runs any step left RUNNING
(the process died mid-step). This rolls the log by hand to make the contract
explicit — the deployments ``core.step_log`` capability emits a slimmed,
jsonl-sink version of exactly this shape into generated projects.

Run:  python step_log.py   (offline — no LLM, no network)
"""

from __future__ import annotations

from datetime import UTC, datetime

from primitives.step_log.schemas.state import (
    StepEvent,
    StepLogState,
    StepRecord,
    StepStatus,
)


def _now() -> datetime:
    return datetime.now(UTC)


class StepLog:
    """In-memory recorder that brackets steps and keeps the event log.

    Holds a :class:`StepLogState`; every ``start`` / ``finish`` appends a
    :class:`StepEvent` and updates the matching :class:`StepRecord`.
    """

    def __init__(self, run_id: str, goal: str = "") -> None:
        self.state = StepLogState(run_id=run_id, goal=goal)
        self._record("run_started", {"run_id": run_id})

    def _record(self, kind: str, payload: dict[str, object]) -> None:
        self.state.events.append(StepEvent(ts=_now(), kind=kind, payload=payload))

    def start(self, step_id: str, attempt: int = 1) -> StepRecord:
        """Mark ``step_id`` RUNNING, append it to the state, and log it."""
        step = StepRecord(
            step_id=step_id,
            status=StepStatus.RUNNING,
            started_at=_now(),
            attempt=attempt,
        )
        self.state.steps.append(step)
        self._record("step_started", {"step_id": step_id, "attempt": attempt})
        return step

    def finish(self, step: StepRecord, status: StepStatus, error: str | None = None) -> StepRecord:
        """Mark ``step`` terminal (DONE / FAILED / SKIPPED) and log it."""
        step.status = status
        step.completed_at = _now()
        step.error = error
        self._record(
            "step_finished",
            {"step_id": step.step_id, "status": status.value, "error": error},
        )
        return step


def replay(state: StepLogState) -> dict[str, StepStatus]:
    """Fold the event log back into per-step status.

    A step left RUNNING (a crash between ``start`` and ``finish``) comes back
    PENDING so a resume re-runs it. This is the pause / resume / retry primitive:
    the event log is the durable state, and this reconstructs it.
    """
    status: dict[str, StepStatus] = {}
    for event in state.events:
        step_id = event.payload.get("step_id")
        if not isinstance(step_id, str):
            continue
        if event.kind == "step_started":
            status[step_id] = StepStatus.RUNNING
        elif event.kind == "step_finished":
            status[step_id] = StepStatus(str(event.payload.get("status", "failed")))
    return {step_id: (StepStatus.PENDING if st is StepStatus.RUNNING else st) for step_id, st in status.items()}


if __name__ == "__main__":
    log = StepLog(run_id="demo-0001", goal="fetch, parse, write")
    fetch = log.start("fetch")
    log.finish(fetch, StepStatus.DONE)
    parse = log.start("parse")
    log.finish(parse, StepStatus.FAILED, error="ValueError: bad row")
    log.start("write")  # left RUNNING (simulated crash) -> replays as PENDING

    resumed = replay(log.state)
    for step_id, status in resumed.items():
        print(f"{step_id}: {status.value}")
    assert resumed["write"] is StepStatus.PENDING, "a crashed step must resume as PENDING"
    print(f"events recorded: {len(log.state.events)}")
