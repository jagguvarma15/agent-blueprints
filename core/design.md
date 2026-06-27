# Kernel Design

> Design level. The decisions and quality trade-offs that make the kernel
> production-grade: durability, determinism, the memory split, the scale ladder,
> and where cross-cutting concerns live.

## Durability is a tier on the runtime port, not "the engine checkpoints"

Checkpointing and durable execution are not the same guarantee, and conflating
them is a documented production trap. The runtime port carries an explicit tier:

| Tier | What it gives you | What it does **not** give you |
|---|---|---|
| `none` | In-memory only. | Any recovery; a crash loses the run. |
| `checkpoint` | Run-state snapshot per step; manual in-process resume. | Failure detection, automatic resume, duplicate-resume prevention. |
| `durable` | External durable execution (Temporal / Restate / DBOS-style): exactly-once, crash-safe. | Nothing extra is promised beyond what the backend guarantees. |

A step that has external side effects must declare idempotency/side-effect
metadata so a `durable` adapter can guarantee exactly-once. The in-process adapter
must never advertise a guarantee it cannot keep. Choosing the tier is a
[scale](#the-scale-ladder) decision.

## Determinism and replay

Checkpoint/resume, durable execution, eval-from-trace, and time-travel debugging
**all** depend on one invariant:

> All non-determinism — model output, tool results, the clock, randomness —
> enters a step only via values recorded into run state.

Given that, re-running a recorded step returns its recorded output instead of
re-invoking the model or tool, so a run replays exactly. The `outputs` map and the
`trace` list in [`RunState`](./interfaces/python/state.py) are that log. Patterns
must not read ambient state (wall clock, env, globals) inside a step.

## The memory three-way split

"Memory" is three different things; the kernel keeps them separate.

| Concern | Where it lives | Why |
|---|---|---|
| **Working memory** | Run state | The slice that flows through the graph this run. |
| **Storage + retrieval** | A `MemoryPort` (vector / kv / graph) | External I/O; an adapter, like any other port. |
| **Context-window assembly** | A cross-cutting concern | *What actually enters the prompt* each step is a policy, not storage. |

Merging these is the most common mis-factor. The [`memory`](../primitives/memory/overview.md)
primitive is the storage/retrieval port; [`context-engineering`](../foundations/context-engineering.md)
owns assembly; run state owns the working slice.

## Cross-cutting concerns

Concerns that wrap the graph rather than living in a step. The kernel owns their
**design-time shape**; the **operational realization** is an `agent-deployments`
binding (the seam is the IR's `cross_cutting` refs + ports).

- **Observability** — a span per step over the trace bus; the OTel GenAI
  conventions are the target backend shape. See
  [`foundations/observability-and-tracing.md`](../foundations/observability-and-tracing.md).
- **Guardrails** — layered input / tool / output policy checks that wrap the
  dispatcher. See [`modifiers/guardrails/overview.md`](../modifiers/guardrails/overview.md).
- **Budgets** — token / cost / wall-clock / step caps enforced by the engine
  against `RunState.budget`.
- **Eval hooks** — two surfaces: an inline `eval` step kind, and offline replay of
  recorded traces as fixtures. See [`foundations/evals-and-quality.md`](../foundations/evals-and-quality.md).

## The scale ladder

Scale is **not** a separate mode — it is how many cross-cutting concerns and which
durability tier you turn on. Each blueprint entry declares the minimum scale at
which it becomes relevant (the `scale` facet), drawn from an ordered vocabulary:

| Scale | What is composed in |
|---|---|
| `prototype` | Model port + steps only. `none` durability, no guardrails. |
| `standard` | + tool registry with a permission gate, budgets, basic tracing. |
| `production` | + `checkpoint` durability, full guardrails, structured eval, memory. |
| `enterprise` | + `durable` runtime, A2A delegation, multi-tenancy and obs backends (deployments). |

The foundation (kernel + run-state contract) never changes across the ladder; you
light up hardening layers as you climb. This is the per-entry counterpart to the
generator's scale presets.

## Decisions

- **The IR is an assembly manifest, not a behavioural program.** It carries
  topology + typed state + wiring as data, and dynamic behaviour as symbolic code
  references. Procedural code is *generated* from it, so data-dependent branching
  and planner-chosen steps never have to be encoded as static graph data.
- **Ports are protocols, not base classes.** Adapters satisfy a port by shape, so
  `agent-deployments` never imports this tree.
- **No new cohort for cross-cutting.** Observability/caching/budgets/retries are
  kernel cross-cutting concerns realized by deployments options, not a flood of
  new modifier entries — preserving the cognitive-versus-operational boundary.
