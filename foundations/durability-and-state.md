# Durability and State

Agents pause: for a human approval, for a slow tool, for a long-running external
job, or simply because a process crashed mid-run. What survives that pause — and
what guarantees you get when the run resumes — is a design decision, not an
accident. Getting it wrong is one of the most common ways a demo-grade agent fails
in production.

> **Boundary.** This doc covers the *design-time* model — the tiers and the state
> contract. The *operational* realization (a Postgres checkpointer, Temporal,
> Restate, DBOS) lives in
> [agent-deployments](https://github.com/jagguvarma15/agent-deployments).

## State is one serializable object

The kernel threads a single [Run State](../core/architecture.md#run-state) object
through every step and checkpoints it. Run State *is* the agent's working memory:
the transcript, the per-step trace, the budget, and recorded step outputs. Two
properties make durability possible:

- **It is fully serializable** — no live handles, sockets, or closures.
- **All non-determinism is recorded into it** (the
  [determinism contract](../core/design.md#determinism-and-replay)) — so resuming
  re-applies recorded outputs instead of re-calling models and tools.

Keep durable storage (a [Memory port](../core/architecture.md#ports)) and
context-window assembly *out* of Run State — they are separate concerns (the
[memory three-way split](../core/design.md#the-memory-three-way-split)).

## Checkpoints are not durable execution

The single most important distinction in this area. They are different
guarantees, and advertising one as the other is a production trap.

| Tier | What it gives you | What it does **not** give you |
|---|---|---|
| `none` | In-memory only. | Any recovery — a crash loses the run. |
| `checkpoint` | Snapshot Run State per step; resume in-process from the last snapshot. | Automatic failure detection, automatic resumption, prevention of a **double-resume** of the same run by two processes. |
| `durable` | Durable execution (Temporal / Restate / DBOS-style): guaranteed recovery, exactly-once via replay/cached effects. | Nothing beyond what the backend guarantees. |

A checkpointer "saves your state — you take it from here." Durable execution
"detects the failure and continues for you." Choosing the tier is a
[scale](../core/design.md#the-scale-ladder) decision: prototypes run `none`,
production runs `checkpoint`, enterprise long-horizon work runs `durable`.

## Idempotency and exactly-once

Durability is only as good as the side effects underneath it. When a step that
sends an email or charges a card is retried or replayed, it must not fire twice.
So a side-effecting step must declare **idempotency metadata** (an idempotency
key, or a "this effect already happened" check) the durable adapter can honour.
Without it, "exactly-once" degrades to "at-least-once," and replay becomes a bug.

## Pause, resume, and long waits

- **Short pauses** (a tool call, a sub-step) need no durability — they are within one process.
- **Human-in-the-loop and long external waits** need at least `checkpoint`, and `durable` if the wait can outlive the process. The [interrupt](../core/flow.md#pause-resume-and-human-in-the-loop) suspends the run and emits a resume token; the run continues from the checkpoint when the token returns.

## Related

- [The kernel's durability tiers](../core/design.md#durability-is-a-tier-on-the-runtime-port-not-the-engine-checkpoints)
- [Saga](../patterns/saga/overview.md) and [Long-Horizon](../patterns/long_horizon/overview.md) — the patterns that most need durability
- [Observability and Tracing](./observability-and-tracing.md) — the trace and the checkpoint are two views of the same run
