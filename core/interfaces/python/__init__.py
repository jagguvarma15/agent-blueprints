"""Framework-agnostic reference contracts for the agent kernel.

The kernel is the normalized core every blueprint composes onto:

- :class:`Step` — the uniform unit of work.
- :class:`Engine` — runs the graph of Steps.
- :class:`ControlPolicy` — picks the next Step (the workflow ↔ agent switch).
- :class:`RunState` — the serializable working memory threaded through every Step.
- the ``*Port`` protocols — the seams adapters bind to.

These are reference *interfaces*. Concrete implementations live in
``agent-deployments``; the IR (``core/spec/ir.schema.json``) is what a selection
compiles to, and the emitters turn that IR into framework-specific code.
"""

from __future__ import annotations

from core.interfaces.python.kernel import (
    ControlPolicy,
    Engine,
    PolicyKind,
    Step,
    StepContext,
    StepKind,
    StepResult,
)
from core.interfaces.python.ports import (
    AgentPort,
    DurabilityTier,
    MemoryPort,
    ModelPort,
    Ports,
    RuntimePort,
    ToolRegistryPort,
)
from core.interfaces.python.state import (
    Budget,
    Message,
    RunState,
    StepStatus,
    TraceEntry,
)

__all__ = [
    "AgentPort",
    "Budget",
    "ControlPolicy",
    "DurabilityTier",
    "Engine",
    "MemoryPort",
    "Message",
    "ModelPort",
    "PolicyKind",
    "Ports",
    "RunState",
    "RuntimePort",
    "Step",
    "StepContext",
    "StepKind",
    "StepResult",
    "StepStatus",
    "ToolRegistryPort",
    "TraceEntry",
]
