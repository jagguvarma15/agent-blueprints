"""Kernel Run-State base — the single serializable object threaded through every Step.

Run-State **is** the agent's *working memory*: the message transcript, the per-step
trace, the resource budget, and the ids that make a run replayable. Every pattern's
``schemas/state.py`` (for example ``patterns/react/schemas/state.py`` → ``ReActState``)
is a domain-specific subclass of :class:`RunState` that adds its own fields.

Three things deliberately do **not** live here (see ``../../design.md`` — the memory
three-way split):

- **Durable / long-term memory** lives behind a ``MemoryPort`` (storage + retrieval I/O).
- **Context-window assembly** (what actually enters the prompt each step) is a
  cross-cutting concern, not state.
- **Run-State is working memory only** — the slice that flows through the graph.

These are framework-agnostic reference contracts. Concrete persistence lives in
``agent-deployments``; nothing in this tree imports a provider.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class StepStatus(str, Enum):
    """Lifecycle of a single Step execution, as recorded in the trace."""

    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    COMPENSATED = "compensated"  # rolled back by a saga compensator


class Message(BaseModel):
    """One entry in the conversation transcript carried in Run-State."""

    role: str = Field(description="'system' | 'user' | 'assistant' | 'tool'.")
    content: str = Field(description="Message text, or the stringified tool result.")
    name: str | None = Field(
        default=None,
        description="Tool name when role == 'tool'; otherwise None.",
    )


class TraceEntry(BaseModel):
    """One recorded Step execution — the unit of the determinism / replay log.

    The Engine appends a :class:`TraceEntry` per Step. Because every Step's output
    is recorded into :attr:`RunState.outputs`, a recorded run can be replayed
    deterministically: re-running a Step returns its recorded value instead of
    re-invoking the model or tool.
    """

    step_id: str = Field(description="Id of the Step this entry records.")
    status: StepStatus = Field(default=StepStatus.PENDING)
    output_key: str | None = Field(
        default=None,
        description="Key into RunState.outputs holding this step's recorded result.",
    )
    error: str | None = Field(default=None, description="Failure summary, if any.")


class Budget(BaseModel):
    """The resource envelope the cross-cutting budget guard enforces."""

    max_steps: int = Field(default=16, ge=1, description="Hard cap on Step count.")
    max_tokens: int | None = Field(default=None, ge=1)
    max_cost_usd: float | None = Field(default=None, ge=0)
    spent_steps: int = Field(default=0, ge=0)
    spent_tokens: int = Field(default=0, ge=0)
    spent_cost_usd: float = Field(default=0.0, ge=0)

    def step_budget_remaining(self) -> int:
        """Steps left before the run must terminate with reason ``'budget'``."""
        return max(0, self.max_steps - self.spent_steps)


class RunState(BaseModel):
    """Base Run-State threaded through every Step and checkpointed by the Engine.

    Domain patterns subclass this and add their own fields (a ReAct loop adds
    ``steps``; a plan-and-execute agent adds ``plan``). The IR's ``state`` section
    references the subclass symbolically rather than inlining it.
    """

    run_id: str = Field(description="Stable id for this run; namespaces checkpoints and traces.")
    goal: str = Field(default="", description="The task driving the run.")
    messages: list[Message] = Field(default_factory=list)
    trace: list[TraceEntry] = Field(default_factory=list)
    outputs: dict[str, object] = Field(
        default_factory=dict,
        description="Recorded Step outputs keyed by Step id — the replay log.",
    )
    budget: Budget = Field(default_factory=Budget)
    terminated_reason: str | None = Field(
        default=None,
        description="Why the run ended: 'done' | 'budget' | 'error' | 'interrupted'.",
    )
