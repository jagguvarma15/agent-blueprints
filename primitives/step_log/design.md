# Step Log — Design

```yaml level=design
quality_attributes:
  reliability: high
  cost: low
  latency: low
  observability: high
failure_modes:
  - { mode: lost-tail, mitigation: "append-only, line-buffered sink — a crash keeps everything up to the last flush" }
  - { mode: replay-skips-half-done-step, mitigation: "a RUNNING step replays as PENDING, so it re-runs" }
  - { mode: secret-in-payload, mitigation: "every string redacted at the sink before it lands on disk" }
  - { mode: unbounded-growth, mitigation: "per-run directories + prune/rotate policy" }
```

> Canonical Pydantic state schema: [`schemas/state.py`](schemas/state.py) — `StepLogState` is the top-level shape; `StepRecord`, `StepEvent`, and the `StepStatus` enum are the auxiliary models. Recipes targeting Step Log reference these names verbatim.

## Component Breakdown

```mermaid
graph TD
    Caller([Agent / workflow]) -->|"start / finish"| Recorder[Step Recorder]
    Recorder -->|"StepEvent"| Redactor[Redactor]
    Redactor -->|"redacted line"| Sink[(events.jsonl sink)]
    Sink -->|"read on resume"| Reader[Event Reader]
    Reader --> Fold[Replay Fold]
    Fold -->|"RUNNING -> PENDING"| StateMap[Per-step status]
    StateMap --> Caller

    style Caller fill:#e3f2fd
    style Recorder fill:#fff3e0
    style Redactor fill:#fce4ec
    style Sink fill:#fff8e1
    style Reader fill:#e8f5e9
    style Fold fill:#f3e5f5
    style StateMap fill:#e8f5e9
```

### Step Recorder
Brackets each step: `start(step_id)` marks it `RUNNING` and appends a `step_started` event; `finish(step, status)` sets the terminal status and appends a `step_finished` event. It owns the `StepLogState` for the run.

### Redactor
Every string passes through a conservative secret-shaped pattern matcher before it is written. A stray API key in a step payload never reaches disk. Redaction is defence-in-depth, not a guarantee — treat the log as sensitive.

### Sink
An append-only, line-buffered `events.jsonl` under `.agent/runs/<run_id>/`. Line buffering means a crash mid-run still leaves a readable, replayable tail. One JSON object per line: `{ts, kind, payload}`.

### Replay Fold
Reads the event log start-to-finish and folds it into per-step state. A `step_started` sets `RUNNING`; a `step_finished` sets the terminal status. A step left `RUNNING` at the end (the process died mid-step) is reported `PENDING` so a resume re-runs it.

## Data Flow

```
// One step, recorded then replayed:
step = recorder.start("fetch")          // append step_started (RUNNING)
try:
  do_work()
  recorder.finish(step, DONE)           // append step_finished (DONE)
except err:
  recorder.finish(step, FAILED, err)    // append step_finished (FAILED)

// On the next run:
status = replay(state)                  // fold events -> {step_id: status}
resume_from = [id for id, s in status if s in (PENDING, FAILED)]
```

## Error Handling

- **Step raised:** record `FAILED` with a compacted, single-line error; the run can retry the step or stop cleanly.
- **Process died mid-step:** the step never got a `step_finished`; replay reports it `PENDING` and the resume re-runs it.
- **Corrupt/partial last line:** a crash between buffered writes can truncate the final line; the reader skips a line that will not parse rather than aborting the whole replay.
- **Sink write failure:** the recorder degrades to a no-op for that event rather than crashing the run; the work continues even if the log gap widens.

## Redaction

The sink is the last line of defence against a secret escaping into a log. It matches conservative, provider-shaped patterns (Anthropic / OpenAI keys, bearer tokens, `scheme://user:pass@host` URLs, GitHub PATs) and replaces the value while preserving the prefix, so a reader can see *which* kind of secret was redacted without seeing it. False positives on legitimate text are far cheaper than a single leaked credential.

## Retention and Scaling

- **Cost:** one append per step transition — negligible next to the work a step does.
- **Growth:** the log grows with the run. Keep per-run directories and prune old runs (keep the last N), or rotate within a long-lived run.
- **Concurrency:** one run owns one sink. Parallel steps within a run serialize on the append; parallel *runs* write to separate directories and never contend.
- **Idempotency:** resume correctness depends on steps being idempotent or safely retryable — a re-run of a non-idempotent step double-applies its side effect. Design steps accordingly.

## Observability Hooks

- Per-run: step count, failure count, wall-clock from `run_started` to the terminal event.
- Per-step: status, attempt count, duration (`started_at` to `completed_at`), compacted error.
- The event log is itself the trace — ship `events.jsonl` to a log backend and the run is queryable with no extra instrumentation.

## Composition

Step Log is the state layer under any multi-step pattern: [ReAct](../tool_use/overview.md) loops, plan-and-execute runs, multi-agent handoffs. The pattern provides the control flow; the step log provides the durable, resumable record of what that control flow did.

## Production concerns

Cognitive concerns this repo covers; operational concerns belong in [agent-deployments](https://github.com/jagguvarma15/agent-deployments).

| Concern | This primitive's surface | Where to read |
|---|---|---|
| Durability & resume | append-only log; RUNNING replays as PENDING | this file |
| Secret leakage | every payload string redacted at the sink | this file, Redaction |
| Idempotency | a resumed step re-runs; side effects must be safe to repeat | [agent-deployments cross-cutting](https://github.com/jagguvarma15/agent-deployments/blob/main/docs/cross-cutting/idempotency.md) |
| Retention | per-run directories; prune/rotate | [agent-deployments cross-cutting](https://github.com/jagguvarma15/agent-deployments/tree/main/docs/cross-cutting) |
