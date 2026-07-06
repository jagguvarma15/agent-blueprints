"""Canonical Pydantic v2 state schema for the Step Log primitive.

The step-log is a run's state expressed as an append-only event log: each step's
lifecycle is recorded as it happens, and replaying the events reconstructs where
the run got to — the substrate for pause / resume / retry / trace. Recipes
targeting Step Log bind their persistence against the shapes declared here.
Self-contained — no cross-entry imports.

See ``../design.md`` for the prose definition of each field.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class StepStatus(str, Enum):
    """Lifecycle of one step.

    A step left ``RUNNING`` when the process died is replayed as ``PENDING``,
    so a resume re-runs it rather than skipping a half-finished side effect.
    """

    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    SKIPPED = "skipped"


class StepRecord(BaseModel):
    """The recorded state of a single step."""

    step_id: str = Field(description="Stable identifier for the step within a run.")
    status: StepStatus = Field(default=StepStatus.PENDING)
    started_at: datetime | None = Field(default=None)
    completed_at: datetime | None = Field(default=None)
    error: str | None = Field(default=None, description="Compacted error set when status is FAILED.")
    attempt: int = Field(default=0, description="1-based attempt count; >1 means the step was retried.")


class StepEvent(BaseModel):
    """One append-only entry in the run's event log."""

    ts: datetime = Field(description="When the event was recorded (UTC).")
    kind: str = Field(description="Event kind, e.g. 'step_started' / 'step_finished' / 'run_finished'.")
    payload: dict[str, object] = Field(default_factory=dict)


class StepLogState(BaseModel):
    """Top-level state for one run of a step-logged agent.

    The ``events`` list is the durable record; ``steps`` is the folded view of
    it. ``run_id`` names the on-disk run directory (``.agent/runs/<run_id>/``).
    """

    run_id: str = Field(description="Unique id for this run; names the .agent/runs/<run_id>/ dir.")
    goal: str = Field(default="", description="What the run is trying to accomplish.")
    steps: list[StepRecord] = Field(default_factory=list)
    events: list[StepEvent] = Field(default_factory=list)
    status: StepStatus = Field(default=StepStatus.RUNNING, description="Overall run status.")
