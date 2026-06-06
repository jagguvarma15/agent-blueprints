"""
Event-Driven — Consume from a stream, dedupe, run agent, persist, ACK.

A minimal illustrative consumer loop. Real projects layer retries + DLQ +
backpressure on top; this example focuses on the core pattern:

    receive event → idempotency check → agent.run → persist → ACK

Design doc:  ../../design.md
Overview:    ../../overview.md
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Protocol

from patterns.event_driven.schemas.state import Event, EventDrivenState, Outcome  # noqa: F401

# ── Interfaces ────────────────────────────────────────────────────────────────


class EventSource(Protocol):
    """A pull-based event source (Redis Streams, Kafka consumer, SQS, ...)."""

    async def read(self, count: int, block_ms: int) -> list[tuple[str, dict]]: ...
    async def ack(self, event_id: str) -> None: ...
    async def dlq(self, event_id: str, envelope: dict) -> None: ...


class IdempotencyStore(Protocol):
    """A claim/release store (Redis SETNX, Postgres unique constraint, ...)."""

    async def claim(self, key: str, ttl_seconds: int) -> bool: ...
    async def mark_completed(self, key: str, ttl_seconds: int) -> None: ...
    async def release(self, key: str) -> None: ...


class Agent(Protocol):
    """The downstream agent — Tool Use, ReAct, RAG, whatever the recipe wires up."""

    async def run(self, event_type: str, payload: dict) -> dict: ...


# ── Core types ────────────────────────────────────────────────────────────────


@dataclass
class DeliveryOutcome:
    """Per-delivery report from the consumer loop.

    Distinct from the canonical :class:`patterns.event_driven.schemas.state.Outcome`,
    which describes the agent's action on a Case. This dataclass reports
    what happened to one delivery attempt (acked / deduped / dlq / retry_pending)
    — the consumer-loop concern, not the agent-decision concern.
    """

    event_id: str
    event_type: str
    status: str  # "acked" | "deduped" | "dlq" | "retry_pending"
    result: dict | None = None
    error: str | None = None


@dataclass
class ConsumerStats:
    events_seen: int = 0
    events_acked: int = 0
    events_deduped: int = 0
    events_dlq: int = 0
    retries: int = 0
    errors_by_class: dict[str, int] = field(default_factory=dict)


# ── Implementation ────────────────────────────────────────────────────────────


CLAIM_TTL_SECONDS = 60  # how long one worker holds the claim before a sibling can retake
DONE_TTL_SECONDS = 24 * 3600  # how long "completed" sticks around to absorb redeliveries
MAX_RETRIES = 3


class EventDrivenConsumer:
    """
    Subscribes to an event source, dispatches each event to an agent, and
    handles idempotency + ACK + DLQ. ``run_until_stopped`` is the entrypoint.
    """

    def __init__(
        self,
        source: EventSource,
        store: IdempotencyStore,
        agent: Agent,
        handler_name: str = "default",
        batch_size: int = 10,
        block_ms: int = 5000,
    ):
        self.source = source
        self.store = store
        self.agent = agent
        self.handler_name = handler_name
        self.batch_size = batch_size
        self.block_ms = block_ms
        self.stats = ConsumerStats()
        self._stop = asyncio.Event()

    def stop(self) -> None:
        """Signal the consumer to drain its current batch and exit."""
        self._stop.set()

    async def run_until_stopped(self) -> ConsumerStats:
        while not self._stop.is_set():
            batch = await self.source.read(count=self.batch_size, block_ms=self.block_ms)
            for event_id, payload in batch:
                await self._handle_one(event_id, payload)
        return self.stats

    async def _handle_one(self, event_id: str, payload: dict) -> DeliveryOutcome:
        self.stats.events_seen += 1
        event_type = payload.get("event_type", "unknown")
        idem_key = f"idemp:{self.handler_name}:{event_id}"

        # Idempotency — claim or detect prior completion.
        claimed = await self.store.claim(idem_key, ttl_seconds=CLAIM_TTL_SECONDS)
        if not claimed:
            await self.source.ack(event_id)
            self.stats.events_deduped += 1
            return DeliveryOutcome(event_id=event_id, event_type=event_type, status="deduped")

        # Agent run.
        try:
            result = await self.agent.run(event_type, payload)
        except RetryableError as exc:
            await self.store.release(idem_key)
            self.stats.retries += 1
            self._bump_error(type(exc).__name__)
            # Don't ACK — broker redelivers after idle-ms.
            return DeliveryOutcome(event_id=event_id, event_type=event_type, status="retry_pending", error=str(exc))
        except Exception as exc:  # permanent failure
            await self.store.release(idem_key)
            await self._route_to_dlq(event_id, payload, exc)
            await self.source.ack(event_id)  # ack after DLQ so source stops redelivering
            self.stats.events_dlq += 1
            self._bump_error(type(exc).__name__)
            return DeliveryOutcome(event_id=event_id, event_type=event_type, status="dlq", error=str(exc))

        # Success — mark completed, persist, ACK.
        await self.store.mark_completed(idem_key, ttl_seconds=DONE_TTL_SECONDS)
        await self.source.ack(event_id)
        self.stats.events_acked += 1
        return DeliveryOutcome(event_id=event_id, event_type=event_type, status="acked", result=result)

    async def _route_to_dlq(self, event_id: str, payload: dict, exc: Exception) -> None:
        envelope = {
            "original_event_id": event_id,
            "original_payload": payload,
            "handler_name": self.handler_name,
            "failure_reason": "agent_raised_permanent",
            "last_error_class": type(exc).__name__,
            "last_error_message": str(exc),
        }
        await self.source.dlq(event_id, envelope)

    def _bump_error(self, error_class: str) -> None:
        self.stats.errors_by_class[error_class] = self.stats.errors_by_class.get(error_class, 0) + 1


class RetryableError(RuntimeError):
    """Raise from an agent when the failure is transient and should be re-delivered."""


# ── Example ───────────────────────────────────────────────────────────────────


if __name__ == "__main__":

    class InMemorySource:
        """A fake Redis-Streams-like source. Events arrive once; ack moves them out."""

        def __init__(self, events: list[tuple[str, dict]]):
            self._queue = list(events)
            self._acked: set[str] = set()
            self._dlq: list[dict] = []

        async def read(self, count: int, block_ms: int) -> list[tuple[str, dict]]:
            # Mimic Redis Streams `XREADGROUP COUNT N BLOCK ms`: wait up to
            # block_ms for new entries when the queue is empty, then return
            # whatever is available.
            if not self._queue:
                await asyncio.sleep(block_ms / 1000)
                return []
            batch, self._queue = self._queue[:count], self._queue[count:]
            return batch

        async def ack(self, event_id: str) -> None:
            self._acked.add(event_id)

        async def dlq(self, event_id: str, envelope: dict) -> None:
            self._dlq.append(envelope)

    class InMemoryStore:
        def __init__(self):
            self._claims: dict[str, str] = {}

        async def claim(self, key: str, ttl_seconds: int) -> bool:
            if key in self._claims:
                return False
            self._claims[key] = "claimed"
            return True

        async def mark_completed(self, key: str, ttl_seconds: int) -> None:
            self._claims[key] = "completed"

        async def release(self, key: str) -> None:
            self._claims.pop(key, None)

    class RebookingAgent:
        """Toy handler: rebook on cancellation, no-op on anything else."""

        async def run(self, event_type: str, payload: dict) -> dict:
            if event_type == "reservation.cancelled":
                if payload.get("simulate_failure") == "transient":
                    raise RetryableError("third-party API throttled")
                if payload.get("simulate_failure") == "permanent":
                    raise ValueError("customer_id not found")
                return {"action": "rebooked", "new_reservation_id": "res_42"}
            return {"action": "no-op"}

    async def main() -> None:
        events = [
            ("evt_001", {"event_type": "reservation.cancelled", "reservation_id": "res_1"}),
            ("evt_002", {"event_type": "reservation.cancelled", "reservation_id": "res_2"}),
            ("evt_003", {"event_type": "reservation.cancelled", "simulate_failure": "permanent"}),
            ("evt_004", {"event_type": "reservation.no_show", "reservation_id": "res_4"}),
            ("evt_001", {"event_type": "reservation.cancelled", "reservation_id": "res_1"}),  # duplicate
        ]
        source = InMemorySource(events)
        store = InMemoryStore()
        consumer = EventDrivenConsumer(source, store, RebookingAgent(), handler_name="rebooker", block_ms=50)

        # Stop after the queue drains.
        async def stopper():
            await asyncio.sleep(0.2)
            consumer.stop()

        await asyncio.gather(consumer.run_until_stopped(), stopper())

        print(
            json.dumps(
                {
                    "seen": consumer.stats.events_seen,
                    "acked": consumer.stats.events_acked,
                    "deduped": consumer.stats.events_deduped,
                    "dlq": consumer.stats.events_dlq,
                    "errors_by_class": consumer.stats.errors_by_class,
                    "dlq_envelopes": source._dlq,
                },
                indent=2,
            )
        )

    asyncio.run(main())
