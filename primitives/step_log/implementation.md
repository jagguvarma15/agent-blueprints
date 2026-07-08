# Step Log — Implementation

```yaml level=implementation
generator:
  produces:
    - { file: agent/steplog.py, from: primitives/step_log/code/python/step_log.py }
ir_fragment:
  state: { base: RunState, schema_ref: primitives/step_log/schemas/state.py }
  steps:
    - { id: step_log.record, kind: state }
    - { id: step_log.replay, kind: state }
  ports: []
```

## Core Interfaces

```
StepStatus: PENDING | RUNNING | DONE | FAILED | SKIPPED

StepRecord:
  step_id: string
  status: StepStatus
  started_at: timestamp?
  completed_at: timestamp?
  error: string?                         // compacted, set when FAILED
  attempt: int                           // 1-based; >1 means retried

StepEvent:
  ts: timestamp                          // UTC
  kind: string                           // step_started | step_finished | run_started | run_finished
  payload: object                        // redacted before write

StepLogState:
  run_id: string                         // names .agent/runs/<run_id>/
  goal: string
  steps: StepRecord[]
  events: StepEvent[]                     // the append-only record
  status: StepStatus                      // overall run status
```

## Core Pseudocode

### record (start / finish)

```
function start(state, step_id, attempt = 1):
  step = StepRecord(step_id, status=RUNNING, started_at=now(), attempt=attempt)
  state.steps.append(step)
  append_event(state, "step_started", {step_id, attempt})
  return step

function finish(state, step, status, error = null):
  step.status = status
  step.completed_at = now()
  step.error = error
  append_event(state, "step_finished", {step_id: step.step_id, status, error})
  return step

function append_event(state, kind, payload):
  event = StepEvent(ts=now(), kind=kind, payload=redact(payload))
  state.events.append(event)         // in the emitted sink: also write one jsonl line
```

### replay

```
function replay(state):
  status = {}
  for event in state.events:
    step_id = event.payload.step_id
    if step_id is null: continue
    if event.kind == "step_started":
      status[step_id] = RUNNING
    else if event.kind == "step_finished":
      status[step_id] = event.payload.status

  // a step still RUNNING never finished -> resume must re-run it
  for step_id, s in status:
    if s == RUNNING: status[step_id] = PENDING
  return status
```

## State Management

The event log is the source of truth; `state.steps` is a convenience view of it. A resume never trusts in-memory state — it reads the `events.jsonl` and folds it with `replay`. That is what makes the log durable: the process can die at any point and the next run reconstructs where it was from the file alone.

The reference recorder keeps the whole `StepLogState` in memory and appends to it. The emitted `agent/steplog.py` (see below) additionally streams each event to a line-buffered `events.jsonl` so the state survives the process.

## Emitted module

The deployments `core.step_log` capability emits `agent/steplog.py` — a slimmed, standard-library-only version of this primitive:

- A `StepLog` context manager that opens `.agent/runs/<run_id>/events.jsonl` and writes one redacted JSON line per event.
- `start` / `finish` with the same contract as the pseudocode above.
- `read_events(path)` and `replay_states(path)` to fold a saved run back into state.

The `.agent/runs/` tree is runtime output and should be gitignored; the recipe wires the sink around the agent's step loop.

## Testing Strategy

- **Round-trip:** record `DONE` / `FAILED` / (interrupted) steps, then `replay` — assert the interrupted step comes back `PENDING`.
- **Redaction:** put a secret-shaped string in a payload; assert it is not present verbatim in the written log.
- **Bracketing:** the first event is `run_started` and (on close) the last is `run_finished`.
- **Corrupt tail:** a truncated final line is skipped, not fatal, on replay.
- **Schema:** `StepLogState` imports and instantiates from minimal kwargs (`run_id` only).

## Common Pitfalls

- **Non-idempotent steps:** a resumed step re-runs; if its side effect isn't safe to repeat, the resume double-applies it. Make steps idempotent or guard them.
- **Trusting in-memory state on resume:** always re-read the log — the whole point is surviving a process that lost its memory.
- **Logging raw payloads:** rely on the redactor, but also avoid stuffing whole secrets or huge blobs into `payload`; keep events small.
- **Never pruning:** a long-lived agent accumulates run directories. Prune to the last N or rotate.
