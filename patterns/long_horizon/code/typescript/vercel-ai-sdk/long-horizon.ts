/**
 * Long-Horizon — Vercel AI SDK variant.
 *
 * Pattern: Checkpoint-and-resume task execution — the tick is the unit of
 *   work (load checkpoint, replay events since, advance by at most one step,
 *   persist checkpoint + events atomically), any worker can resume any task,
 *   re-planning happens only when the executor asks, and every side-effecting
 *   step carries a stable idempotency key.
 * Framework: Vercel AI SDK (ai ^4.0.0) + @ai-sdk/anthropic (^1.0.0) for the
 *   live planner (generateObject with a Plan schema — see the comment in the
 *   demo); the runtime itself is plain TS so it slots over any store.
 * Idioms: in-memory store with transactional pairing standing in for the
 *   documented Postgres tables; external signals append to the event log
 *   only (never a checkpoint — snapshotting a state the signal was not
 *   applied to would absorb it into the version watermark unseen); the
 *   demo survives a simulated crash purely from checkpoint + replay.
 *   Matches the core contract of ../../python/long_horizon.py; shapes
 *   mirror ../../../schemas/state.py (the Pydantic source of truth).
 * Design doc: ../../../design.md
 *
 * Install:  pnpm add ai @ai-sdk/anthropic
 *           (or via tsx-on-demand: npx tsx long-horizon.ts)
 * Run:      npx tsx long-horizon.ts       (offline demo — stub planner)
 *
 * Note: ESM only.
 * tsconfig snippet: { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022" }
 */

// ── Canonical shapes ─────────────────────────────────────────────────────────
// Mirrors patterns/long_horizon/schemas/state.py.

export type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "aborted"
  | "requires_human"
  | "deadline_exceeded";
export type StepStatus = "pending" | "in_progress" | "completed" | "failed" | "skipped";
export type EventKind =
  | "task_started"
  | "plan_emitted"
  | "replanned"
  | "step_started"
  | "step_completed"
  | "step_failed"
  | "external_signal_received"
  | "checkpoint_emitted"
  | "human_escalation_requested"
  | "task_completed"
  | "task_aborted"
  | "task_deadline_exceeded";

export interface StepRecord {
  stepId: string;
  kind: string;
  description: string;
  status: StepStatus;
  attempt: number;
  idempotencyKey?: string;
  result: Record<string, unknown>;
  error?: string;
}

export interface Plan {
  version: number;
  steps: StepRecord[];
}

export interface EventLogEntry {
  taskId: string;
  seq: number;
  kind: EventKind;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface LongHorizonState {
  taskId: string;
  goal: string;
  status: TaskStatus;
  plan: Plan;
  deadlineAt?: string;
  lastWorkerId?: string;
  resumeCount: number;
  replanCount: number;
}

export interface Checkpoint {
  taskId: string;
  version: number;
  state: LongHorizonState;
}

const TERMINAL: TaskStatus[] = ["completed", "aborted", "requires_human", "deadline_exceeded"];

// ── Store ────────────────────────────────────────────────────────────────────
// The documented default is Postgres with the checkpoint row and the event
// rows committing in one transaction; this in-memory stand-in keeps the
// contract (persist writes snapshot + events together).

export class InMemoryStore {
  private checkpoints = new Map<string, Checkpoint>();
  private events = new Map<string, EventLogEntry[]>();

  load(taskId: string): { state: LongHorizonState; since: EventLogEntry[] } {
    const checkpoint = this.checkpoints.get(taskId);
    if (!checkpoint) throw new Error(`unknown task: ${taskId}`);
    const since = (this.events.get(taskId) ?? []).filter((e) => e.seq > checkpoint.version);
    return { state: structuredClone(checkpoint.state), since };
  }

  persist(state: LongHorizonState, events: EventLogEntry[]): void {
    const log = this.events.get(state.taskId) ?? [];
    log.push(...events);
    this.events.set(state.taskId, log);
    const version = log.length ? log[log.length - 1].seq : 0;
    this.checkpoints.set(state.taskId, { taskId: state.taskId, version, state });
  }

  /**
   * Out-of-band append — the log only, NO snapshot. This is how external
   * signals arrive: the signal writer never holds the task state, so it
   * must not write a checkpoint. The next tick replays it.
   */
  appendEvents(taskId: string, events: EventLogEntry[]): void {
    const log = this.events.get(taskId) ?? [];
    log.push(...events);
    this.events.set(taskId, log);
  }

  nextSeq(taskId: string): number {
    const log = this.events.get(taskId) ?? [];
    return log.length ? log[log.length - 1].seq + 1 : 1;
  }

  eventLog(taskId: string): EventLogEntry[] {
    return this.events.get(taskId) ?? [];
  }
}

/** Seq-correct event construction for one transaction (a local cursor). */
class EventFactory {
  private seq: number;
  constructor(
    store: InMemoryStore,
    private taskId: string,
  ) {
    this.seq = store.nextSeq(taskId);
  }
  make(kind: EventKind, payload: Record<string, unknown> = {}): EventLogEntry {
    return {
      taskId: this.taskId,
      seq: this.seq++,
      kind,
      payload,
      occurredAt: new Date().toISOString(),
    };
  }
}

// ── Executor + planner seams ─────────────────────────────────────────────────

export interface StepResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  /** Blocked on an external signal — persist and return; the signal completes the step. */
  waiting?: boolean;
  /** Set when the result implies the plan is stale; replan happens once, on request. */
  replanReason?: string;
}

export type Executor = (step: StepRecord, state: LongHorizonState) => Promise<StepResult>;
export type Planner = (goal: string) => Promise<Plan>;

export const idempotencyKey = (state: LongHorizonState, step: StepRecord): string =>
  `${state.taskId}:${step.stepId}:${step.attempt}`;

// ── Event application (the replay half of resume) ────────────────────────────

export function applyEvents(state: LongHorizonState, events: EventLogEntry[]): LongHorizonState {
  for (const entry of events) {
    if (entry.kind === "external_signal_received") {
      const step = state.plan.steps.find(
        (s) => s.stepId === entry.payload.stepId && s.status === "in_progress",
      );
      if (step) {
        // A signal completes the wait step it targets: the step's job was
        // to wait, and the signal is the thing it waited for.
        step.status = "completed";
        const { stepId: _stepId, ...result } = entry.payload;
        step.result = result;
      }
    }
  }
  return state;
}

// ── The tick ─────────────────────────────────────────────────────────────────

export async function startTask(
  store: InMemoryStore,
  taskId: string,
  goal: string,
  planner: Planner,
): Promise<void> {
  const state: LongHorizonState = {
    taskId,
    goal,
    status: "in_progress",
    plan: await planner(goal),
    resumeCount: 0,
    replanCount: 0,
  };
  const event = new EventFactory(store, taskId);
  store.persist(state, [
    event.make("task_started", { goal }),
    event.make("plan_emitted", { steps: state.plan.steps.length }),
  ]);
}

export async function tick(
  store: InMemoryStore,
  taskId: string,
  executor: Executor,
  planner: Planner,
  workerId = "worker-1",
): Promise<LongHorizonState> {
  const { state: loaded, since } = store.load(taskId);
  const state = applyEvents(loaded, since);
  state.lastWorkerId = workerId;
  const event = new EventFactory(store, taskId);

  if (TERMINAL.includes(state.status)) return state;

  if (state.deadlineAt && new Date() > new Date(state.deadlineAt)) {
    state.status = "deadline_exceeded";
    store.persist(state, [event.make("task_deadline_exceeded")]);
    return state;
  }

  const step = state.plan.steps.find((s) => s.status === "pending");
  if (!step) {
    if (state.plan.steps.some((s) => s.status === "in_progress")) {
      store.persist(state, []); // waiting on a signal — nothing to run
      return state;
    }
    state.status = "completed";
    store.persist(state, [event.make("task_completed")]);
    return state;
  }

  step.status = "in_progress";
  step.attempt += 1;
  step.idempotencyKey = idempotencyKey(state, step);
  const events = [event.make("step_started", { stepId: step.stepId })];

  const result = await executor(step, state);

  if (result.waiting) {
    store.persist(state, events); // blocked on the outside world
    return state;
  }
  if (result.ok) {
    step.status = "completed";
    step.result = result.data ?? {};
    events.push(event.make("step_completed", { stepId: step.stepId }));
  } else {
    step.status = "failed";
    step.error = result.error;
    events.push(event.make("step_failed", { stepId: step.stepId, error: result.error }));
  }

  if (result.replanReason) {
    // Replan only on explicit request — planner calls are expensive.
    state.plan = await planner(state.goal);
    state.replanCount += 1;
    events.push(event.make("replanned", { reason: result.replanReason }));
  }

  store.persist(state, events);
  return state;
}

/** What a fresh worker does after a crash: load, replay, count the resume. */
export function resume(store: InMemoryStore, taskId: string): LongHorizonState {
  const { state: loaded, since } = store.load(taskId);
  const state = applyEvents(loaded, since);
  state.resumeCount += 1;
  store.persist(state, []);
  return state;
}

// ── Offline demo ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const store = new InMemoryStore();

  // The live planner is a planner-class LLM call:
  //   import { generateObject } from "ai";
  //   import { anthropic } from "@ai-sdk/anthropic";
  //   const plan = await generateObject({ model: anthropic("claude-opus-4-8"),
  //     schema: PlanSchema, prompt: `Plan the steps for: ${goal}` });
  const stubPlanner: Planner = async () => ({
    version: 1,
    steps: [
      { stepId: "draft", kind: "llm", description: "Draft the report", status: "pending", attempt: 0, result: {} },
      { stepId: "review", kind: "wait_for_signal", description: "Wait for editorial sign-off", status: "pending", attempt: 0, result: {} },
      { stepId: "publish", kind: "tool", description: "Publish the report", status: "pending", attempt: 0, result: {} },
    ],
  });

  const stubExecutor: Executor = async (step) =>
    step.kind === "wait_for_signal"
      ? { ok: false, waiting: true }
      : { ok: true, data: { note: `${step.stepId} done` } };

  await startTask(store, "task-1", "Publish the weekly report", stubPlanner);
  await tick(store, "task-1", stubExecutor, stubPlanner); // draft completes
  await tick(store, "task-1", stubExecutor, stubPlanner); // review starts waiting

  // The outside world signs off — log-only append, no checkpoint.
  const signal = new EventFactory(store, "task-1");
  store.appendEvents("task-1", [
    signal.make("external_signal_received", { stepId: "review", approver: "editor" }),
  ]);

  // Simulated crash: fresh worker, state rebuilt purely from checkpoint + replay.
  resume(store, "task-1");
  let state = await tick(store, "task-1", stubExecutor, stubPlanner, "worker-2");
  state = await tick(store, "task-1", stubExecutor, stubPlanner, "worker-2");

  const done = state.plan.steps.filter((s) => s.status === "completed").length;
  console.log(`status=${state.status} resumes=${state.resumeCount} steps_done=${done}`);
  for (const entry of store.eventLog("task-1")) {
    console.log(`  ${String(entry.seq).padStart(2)} ${entry.kind}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
