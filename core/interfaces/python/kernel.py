"""Kernel execution contracts — Step, Engine, Control Policy.

Workflows and agents are the **same machine**: a graph of Steps run by an Engine.
The only thing that differs is the Control Policy — *who picks the next Step*. Code
picks (a static graph) → workflow; the model picks (a planner / router) → agent.
"Who picks next" is therefore a single swappable policy over one shared engine.

All three are :class:`~typing.Protocol` types: an adapter satisfies a contract by
shape. Concrete engines/policies live in ``agent-deployments``; this module is the
framework-agnostic reference contract the IR and the emitters target.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from enum import Enum
from typing import Protocol, runtime_checkable

from core.interfaces.python.ports import Ports
from core.interfaces.python.state import RunState


class StepKind(str, Enum):
    """The closed set of Step kinds the IR and the code emitters understand.

    Everything an agent does is one of these — there is no escape hatch other
    than ``CODE`` (arbitrary deterministic logic).
    """

    LLM = "llm"  # a model call
    TOOL = "tool"  # a tool / function / MCP invocation
    RETRIEVAL = "retrieval"  # a memory/vector read
    ROUTER = "router"  # classify, then branch
    REDUCER = "reducer"  # merge concurrent results into state
    SUBGRAPH = "subgraph"  # a nested graph (in-process delegation)
    HUMAN = "human"  # a human-in-the-loop gate
    COMPENSATION = "compensation"  # a saga rollback handler
    EVAL = "eval"  # an inline evaluation/scoring step
    CODE = "code"  # plain deterministic code


class PolicyKind(str, Enum):
    """The four control policies — the workflow ↔ agent dial."""

    STATIC_GRAPH = "static_graph"  # code decides the next step → workflow
    ROUTER = "router"  # a classifier chooses one branch
    PLANNER = "planner"  # the model plans the next step(s) → agent
    HYBRID = "hybrid"  # static skeleton with model-chosen sub-steps


@dataclass
class StepContext:
    """Read-mostly services handed to every Step at execution time.

    Ports are injected here so a Step never imports a concrete adapter. ``emit``
    is the optional event sink shared by streaming and the trace bus — a Step that
    streams pushes tokens/events through it.
    """

    run_id: str
    ports: Ports
    emit: Callable[[object], None] | None = None


@dataclass
class StepResult:
    """What a Step returns: a state delta plus optional metadata.

    A Step is a *reducer*: it returns the ``patch`` to merge into Run-State rather
    than mutating it in place (so concurrent steps merge cleanly and replay is
    exact). ``status``/``error`` feed the trace.
    """

    patch: dict[str, object] = field(default_factory=dict)
    status: str = "succeeded"
    error: str | None = None


@runtime_checkable
class Step(Protocol):
    """One unit of work. Everything is a Step — an LLM call, a tool call, a
    retrieval, a sub-graph, a human gate, or plain code.

    A Step is a pure function of ``(state, context)``: it reads Run-State and
    returns a :class:`StepResult` carrying a patch. **All** non-determinism (model
    output, tool results, clock, randomness) must arrive via ``context`` and be
    recorded into Run-State, so a recorded run replays exactly. A Step with
    external side effects may also supply ``compensate`` so the Engine can unwind a
    failed multi-step transaction (the saga contract).
    """

    id: str
    kind: StepKind

    def run(self, state: RunState, context: StepContext) -> StepResult: ...


@runtime_checkable
class ControlPolicy(Protocol):
    """Decides the next Step given the current Run-State.

    This is the single knob that turns a workflow (code decides) into an agent
    (the model decides). Returns the next Step id, or ``None`` to terminate.
    """

    kind: PolicyKind

    def next_step(self, state: RunState) -> str | None: ...


@runtime_checkable
class Engine(Protocol):
    """Runs a graph of Steps.

    Resolves the next Step via the :class:`ControlPolicy`; enforces
    retries / timeouts / budget; appends a ``TraceEntry`` per Step; checkpoints
    Run-State through the runtime port; and supports pause / resume (an
    ``interrupt`` before a ``HUMAN`` step suspends the run until a resume token
    arrives).
    """

    def run(self, state: RunState) -> RunState: ...

    def resume(self, run_id: str) -> RunState: ...
