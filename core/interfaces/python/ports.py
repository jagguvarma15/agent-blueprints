"""Kernel Ports — the seams where the agent core meets the outside world.

Interfaces live here; concrete adapters (a specific model provider, vector store,
MCP server, durable runtime) live in ``agent-deployments`` and bind to a port by
selection. The IR's ``ports`` section names the abstract ports a composed agent
needs; the generator resolves each one to a deployments option.

All ports are :class:`~typing.Protocol` types — an adapter satisfies a port by
*shape*, with no import-time coupling to this module.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from enum import Enum
from typing import Protocol, runtime_checkable

from core.interfaces.python.state import Message


@runtime_checkable
class ModelPort(Protocol):
    """The LLM. Generates a completion from messages, optionally tool-aware."""

    def generate(self, messages: Sequence[Message], tools: Sequence[dict] | None = None) -> str: ...


@runtime_checkable
class ToolRegistryPort(Protocol):
    """The tool surface — native functions or an MCP server. Model-controlled.

    Mirrors MCP's "tools" primitive: the model is shown ``schemas()`` and asks to
    ``invoke`` one. A permission gate (see ``primitives/tool_use``) sits in front
    of ``invoke`` for Ask/Never-tier tools.
    """

    def schemas(self) -> list[dict]: ...

    def invoke(self, name: str, args: dict) -> str: ...


@runtime_checkable
class MemoryPort(Protocol):
    """Durable storage + retrieval (vector / key-value / graph).

    This is **not** working memory (that is Run-State) and **not** context
    assembly (that is cross-cutting). It is the storage/retrieval I/O only —
    MCP's "resources" primitive in spirit.
    """

    def write(self, key: str, value: object) -> None: ...

    def search(self, query: str, k: int = 5) -> list[dict]: ...


class DurabilityTier(str, Enum):
    """How much execution durability the runtime backend guarantees.

    These are not interchangeable: ``checkpoint`` snapshots state but does not
    detect failures, resume automatically, or prevent a double-resume of the same
    run; only ``durable`` gives exactly-once recovery across process death.
    """

    NONE = "none"  # in-memory only; a crash loses the run
    CHECKPOINT = "checkpoint"  # snapshot Run-State per step; manual in-process resume
    DURABLE = "durable"  # external durable execution; exactly-once, crash-safe


@runtime_checkable
class RuntimePort(Protocol):
    """Where the Engine runs and how it persists Run-State.

    Carries the :class:`DurabilityTier` so callers never assume a guarantee the
    backend cannot keep.
    """

    tier: DurabilityTier

    def save(self, run_id: str, state: object) -> None: ...

    def load(self, run_id: str) -> object | None: ...


@runtime_checkable
class AgentPort(Protocol):
    """Delegate a task to another agent.

    Covers both an in-process sub-graph and a remote agent addressed over A2A
    (an Agent Card + task lifecycle). Multi-agent topologies compose by treating
    "call another agent" as one more Step backed by this port.
    """

    def delegate(self, agent: str, task: str) -> str: ...


@dataclass
class Ports:
    """The bundle of bound port adapters handed to every Step via the context.

    ``model`` is the only required port; the rest are present when the selection
    includes the primitive/modifier that needs them.
    """

    model: ModelPort
    tools: ToolRegistryPort | None = None
    memory: MemoryPort | None = None
    runtime: RuntimePort | None = None
    agents: AgentPort | None = None
