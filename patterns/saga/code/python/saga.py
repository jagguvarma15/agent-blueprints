"""
Saga — Long-running multi-step process with explicit compensation on failure.

A minimal illustrative orchestration-style saga. Each step is a (do, undo)
pair; on failure, the coordinator walks completed steps in reverse and
invokes each compensator. Three terminal states:

    completed              — all steps did
    compensated            — all completed steps undid
    partially_compensated  — a compensator itself failed (needs human attention)

Real projects layer a durable saga log + a checkpoint store on top so the
coordinator can resume after a crash; this example keeps the log in-memory
to focus on the core pattern.

Design doc:  ../../design.md
Overview:    ../../overview.md
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable, Literal


# ── Core types ────────────────────────────────────────────────────────────────


@dataclass
class StepContext:
    """Passed to every `do` and `undo`. Holds the saga payload + outputs so far."""

    saga_id: str
    payload: dict
    outputs: dict[str, Any] = field(default_factory=dict)


@dataclass
class Step:
    """A (forward, reverse) pair. Both functions MUST be idempotent."""

    id: str
    do: Callable[[StepContext], Any]
    undo: Callable[[StepContext, Any], None]


SagaEventKind = Literal[
    "started",
    "completed",
    "failed",
    "compensation_started",
    "compensation_done",
    "compensation_failed",
    "saga_completed",
    "saga_compensated",
    "saga_partially_compensated",
]


@dataclass
class SagaLogEntry:
    seq: int
    timestamp: float
    step_id: str
    event: SagaEventKind
    output: Any | None = None
    error_class: str | None = None
    error_message: str | None = None


@dataclass
class SagaResult:
    saga_id: str
    state: Literal["completed", "compensated", "partially_compensated"]
    steps_executed: list[str] = field(default_factory=list)
    compensations_run: list[str] = field(default_factory=list)
    failed_step: str | None = None
    failed_compensator: str | None = None
    saga_log: list[SagaLogEntry] = field(default_factory=list)


class RetryableError(RuntimeError):
    """Raise from a step's `do` or `undo` to signal a transient failure.

    The coordinator's retry policy decides whether to back off and retry the
    same step/compensator or escalate. This example doesn't implement
    retries — production sagas pair this with the resilience layer.
    """


# ── Implementation ────────────────────────────────────────────────────────────


class Saga:
    """
    A saga coordinator. Construct with a list of Step objects in execution
    order, then call ``run(payload)`` to execute.
    """

    def __init__(self, name: str, steps: list[Step]):
        if not steps:
            raise ValueError("Saga must have at least one step")
        step_ids = [s.id for s in steps]
        if len(set(step_ids)) != len(step_ids):
            raise ValueError(f"Saga {name!r} has duplicate step ids: {step_ids}")
        self.name = name
        self.steps = steps

    def run(self, payload: dict, *, saga_id: str | None = None) -> SagaResult:
        ctx = StepContext(saga_id=saga_id or f"{self.name}_{int(time.time() * 1000)}", payload=payload)
        log: list[SagaLogEntry] = []
        completed: list[Step] = []
        failed_step: str | None = None

        # Forward execution.
        for step in self.steps:
            self._append(log, step.id, "started")
            try:
                output = step.do(ctx)
            except Exception as exc:
                self._append(log, step.id, "failed",
                             error_class=type(exc).__name__, error_message=str(exc))
                failed_step = step.id
                break
            ctx.outputs[step.id] = output
            completed.append(step)
            self._append(log, step.id, "completed", output=output)

        if failed_step is None:
            self._append(log, "_saga_", "saga_completed")
            return SagaResult(
                saga_id=ctx.saga_id,
                state="completed",
                steps_executed=[s.id for s in completed],
                saga_log=log,
            )

        # Compensation walk — completed steps in reverse.
        compensations_run: list[str] = []
        failed_compensator: str | None = None
        for step in reversed(completed):
            self._append(log, step.id, "compensation_started")
            try:
                step.undo(ctx, ctx.outputs.get(step.id))
            except Exception as exc:
                self._append(log, step.id, "compensation_failed",
                             error_class=type(exc).__name__, error_message=str(exc))
                failed_compensator = step.id
                break
            compensations_run.append(step.id)
            self._append(log, step.id, "compensation_done")

        if failed_compensator is None:
            self._append(log, "_saga_", "saga_compensated")
            state: Literal["completed", "compensated", "partially_compensated"] = "compensated"
        else:
            self._append(log, "_saga_", "saga_partially_compensated")
            state = "partially_compensated"

        return SagaResult(
            saga_id=ctx.saga_id,
            state=state,
            steps_executed=[s.id for s in completed],
            compensations_run=compensations_run,
            failed_step=failed_step,
            failed_compensator=failed_compensator,
            saga_log=log,
        )

    @staticmethod
    def _append(
        log: list[SagaLogEntry],
        step_id: str,
        event: SagaEventKind,
        *,
        output: Any | None = None,
        error_class: str | None = None,
        error_message: str | None = None,
    ) -> None:
        log.append(SagaLogEntry(
            seq=len(log) + 1,
            timestamp=time.time(),
            step_id=step_id,
            event=event,
            output=output,
            error_class=error_class,
            error_message=error_message,
        ))


# ── Example: rebooking saga ───────────────────────────────────────────────────


if __name__ == "__main__":
    import json

    # --- Fake side-effect surfaces (in-process stand-ins for real services) ---

    class World:
        """Mutable in-memory state representing the external world."""

        def __init__(self) -> None:
            self.search_locks: set[str] = set()
            self.reservations: dict[str, dict] = {
                "res_42": {"restaurant": "Acme", "time": "2026-05-25T19:00", "party": 4},
            }
            self.cancelled_reservations: dict[str, dict] = {}
            self.sms_sent: list[dict] = []

    def make_steps(world: World, *, simulate_failure_at: str | None = None,
                   compensator_fails_at: str | None = None) -> list[Step]:
        def fail_if(step_id: str, where: dict[str, str | None]) -> None:
            if where.get("do") == step_id:
                raise ValueError(f"injected forward failure at {step_id}")
            if where.get("undo") == step_id:
                raise ValueError(f"injected compensator failure at {step_id}")

        forward_failures = {"do": simulate_failure_at, "undo": None}
        backward_failures = {"do": None, "undo": compensator_fails_at}

        def do_search(ctx: StepContext) -> dict:
            fail_if("search", forward_failures)
            lock = f"search_lock_{ctx.saga_id}"
            world.search_locks.add(lock)
            return {"search_id": lock, "candidates": [{"slot_id": "slot_99", "time": "2026-05-25T20:00"}]}

        def undo_search(ctx: StepContext, output: dict) -> None:
            fail_if("search", backward_failures)
            world.search_locks.discard(output["search_id"])

        def do_reserve(ctx: StepContext) -> dict:
            fail_if("reserve", forward_failures)
            best = ctx.outputs["search"]["candidates"][0]
            res_id = f"res_new_{ctx.saga_id}"
            world.reservations[res_id] = {"slot_id": best["slot_id"], "party": ctx.payload["party_size"]}
            return {"reservation_id": res_id}

        def undo_reserve(ctx: StepContext, output: dict) -> None:
            fail_if("reserve", backward_failures)
            world.reservations.pop(output["reservation_id"], None)

        def do_cancel_old(ctx: StepContext) -> dict:
            fail_if("cancel_old", forward_failures)
            original = ctx.payload["original_reservation_id"]
            if original not in world.reservations:
                raise ValueError(f"original reservation {original} not found")
            snapshot = world.reservations.pop(original)
            world.cancelled_reservations[original] = snapshot
            return {"snapshot_id": original, "snapshot": snapshot}

        def undo_cancel_old(ctx: StepContext, output: dict) -> None:
            fail_if("cancel_old", backward_failures)
            world.reservations[output["snapshot_id"]] = output["snapshot"]
            world.cancelled_reservations.pop(output["snapshot_id"], None)

        def do_notify(ctx: StepContext) -> dict:
            fail_if("notify", forward_failures)
            sms = {
                "customer_id": ctx.payload["customer_id"],
                "kind": "rebook_confirmation",
                "reservation_id": ctx.outputs["reserve"]["reservation_id"],
            }
            world.sms_sent.append(sms)
            return sms

        def undo_notify(ctx: StepContext, output: dict) -> None:
            # Forward recovery — the SMS is irreversible. Send a cancellation.
            fail_if("notify", backward_failures)
            world.sms_sent.append({
                "customer_id": output["customer_id"],
                "kind": "rebook_cancellation",
                "supersedes": output["reservation_id"],
            })

        return [
            Step("search", do_search, undo_search),
            Step("reserve", do_reserve, undo_reserve),
            Step("cancel_old", do_cancel_old, undo_cancel_old),
            Step("notify", do_notify, undo_notify),
        ]

    # Scenario 1: happy path
    world = World()
    saga = Saga("rebook", make_steps(world))
    result = saga.run(payload={
        "original_reservation_id": "res_42",
        "customer_id": "cust_7",
        "party_size": 4,
    }, saga_id="sag_happy")
    print("=== Scenario 1: happy path ===")
    print(json.dumps({
        "state": result.state,
        "steps_executed": result.steps_executed,
        "compensations_run": result.compensations_run,
        "log_event_count": len(result.saga_log),
        "world.sms_sent": world.sms_sent,
    }, indent=2))

    # Scenario 2: failure mid-saga → clean compensation
    world = World()
    saga = Saga("rebook", make_steps(world, simulate_failure_at="cancel_old"))
    result = saga.run(payload={
        "original_reservation_id": "res_42",
        "customer_id": "cust_7",
        "party_size": 4,
    }, saga_id="sag_compensated")
    print("\n=== Scenario 2: forward failure at cancel_old → compensated ===")
    print(json.dumps({
        "state": result.state,
        "failed_step": result.failed_step,
        "steps_executed": result.steps_executed,
        "compensations_run": result.compensations_run,
        "world.search_locks": list(world.search_locks),
        "world.reservations": list(world.reservations.keys()),
        "world.sms_sent": world.sms_sent,
    }, indent=2))

    # Scenario 3: compensator itself fails → partially_compensated (page!)
    world = World()
    saga = Saga(
        "rebook",
        make_steps(world, simulate_failure_at="notify", compensator_fails_at="cancel_old"),
    )
    result = saga.run(payload={
        "original_reservation_id": "res_42",
        "customer_id": "cust_7",
        "party_size": 4,
    }, saga_id="sag_stuck")
    print("\n=== Scenario 3: notify fails AND undo_cancel_old fails → partially_compensated ===")
    print(json.dumps({
        "state": result.state,
        "failed_step": result.failed_step,
        "failed_compensator": result.failed_compensator,
        "compensations_run": result.compensations_run,
        "world.reservations": list(world.reservations.keys()),
    }, indent=2))
