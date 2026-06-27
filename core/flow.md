# Kernel Flow

> Flow level. The dynamic behaviour: how the engine runs a graph step by step,
> how the control policy switches workflow into agent, and how pause/resume,
> streaming, and compensation play out at runtime.

## The run loop

```mermaid
sequenceDiagram
    participant E as Engine
    participant P as Control Policy
    participant S as Step
    participant St as Run State

    E->>St: load / init run state (run_id)
    loop until policy returns None or budget exhausted
        E->>P: next_step(state)
        P-->>E: step_id (or None)
        E->>S: run(state, context)
        S-->>E: StepResult(patch)
        E->>St: merge patch + append TraceEntry
        E->>St: checkpoint (via runtime port)
    end
    E-->>E: terminated_reason set; return state
```

Each turn: the engine asks the **control policy** which step is next, runs that
step against the current run state, merges the returned patch, records a trace
entry, and checkpoints. The loop ends when the policy returns `None`, a
termination condition fires, or the budget is exhausted.

## The workflow ↔ agent switch, in motion

The *same* loop produces a workflow or an agent depending only on the policy:

- **Static graph** — `next_step` follows authored edges. The path is fixed; the
  model only fills step content. Predictable, testable with ordinary tests.
- **Router** — a classifier step writes a decision into run state; `next_step`
  reads it and branches.
- **Planner** — the model proposes the next step(s); `next_step` returns what the
  model chose. The path varies per run — this is the agentic regime.
- **Hybrid** — a static skeleton whose individual stages defer to a planner.

Nothing else in the kernel changes. This is why a pattern can "evolve" from a
workflow into an agent (see each pattern's evolution facet) by swapping its policy.

## Data flow and termination

Steps communicate **only through run state**. A step declares the fields it reads
(`inputs`) and writes (`outputs`); the engine derives sequential edges from
declaration order and dataflow, so explicit `edges` are needed only for router,
parallel, or loop shapes. Concurrent writes to the same field merge via that
field's reducer (`replace` / `append` / `merge`).

Termination is explicit, never implicit: a `max_steps` cap, a token budget, a
guard condition over run state, and a fallback step. Every pattern sets these in
its control policy so no run can spin forever.

## Pause, resume, and human-in-the-loop

A step may declare an `interrupt` (`before` or `after`). When the engine reaches
it, it checkpoints and **suspends** the run, emitting a resume token. A human (or
an external async actor) acts, then the run resumes from the checkpoint. Because
the human gate is just a step and the resume path is just the engine's normal
load-and-continue, human-in-the-loop needs no special machinery — only a runtime
port whose checkpoint survives process death if the wait is long. See
[`modifiers/human_in_the_loop/overview.md`](../modifiers/human_in_the_loop/overview.md).

## Streaming

A step that streams pushes tokens or events through the context's `emit` sink. The
same sink feeds the trace bus, so the user-facing stream and the observable trace
are one channel — partial output and per-step spans come from the same events.

## Failure and compensation

Retries and timeouts are the engine's job. When a multi-step transaction fails
partway, rollback is **path-dependent** — you can only compensate the steps that
actually ran — so it cannot be encoded as static edges. Instead, each side-effecting
step supplies a `compensate` handler; the engine keeps a compensation stack in run
state and unwinds it on failure. This is the kernel form of the
[Saga](../patterns/saga/overview.md) pattern.
