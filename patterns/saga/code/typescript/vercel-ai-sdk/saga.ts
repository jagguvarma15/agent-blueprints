/**
 * Saga — Vercel AI SDK variant.
 *
 * Pattern: Long-running multi-step process with explicit compensation on
 *   failure. Each step is a (do, undo) pair; on failure, the coordinator
 *   walks completed steps in reverse and invokes each compensator. Three
 *   terminal states: completed | compensated | partially_compensated.
 * Framework: Vercel AI SDK (ai ^4.0.0). Saga orchestration is plain TS —
 *   the SDK isn't load-bearing for the pattern, but it would be used inside
 *   the individual step functions (e.g. an LLM call to decide a refund
 *   amount, gated by the saga's compensation contract).
 * Idioms: Step<I, O> typed pair (do, undo) → Saga.run() walks forward → on
 *   throw, walks backward executing each compensator → returns a typed
 *   SagaResult with the terminal state and the full log.
 * Design doc: ../../../design.md (the framework-agnostic ../../python/saga.py
 *   runs the same three scenarios: happy path, mid-saga failure with clean
 *   compensation, compensator-itself-fails leading to partially_compensated).
 *
 * Install:  pnpm add ai @ai-sdk/anthropic
 *           (or via tsx-on-demand: npx tsx saga.ts)
 * Run:      npx tsx saga.ts          # no API key needed; saga is plain TS
 *
 * Note: ESM only.
 * tsconfig snippet: { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022" }
 */

// ── Types ────────────────────────────────────────────────────────────────────

type SagaState = "running" | "completed" | "compensated" | "partially_compensated";

interface Step<C extends Record<string, unknown>, O> {
  name: string;
  do: (ctx: C) => Promise<O>;
  undo?: (ctx: C, output: O) => Promise<void>;
}

interface SagaLogEvent {
  step: string;
  phase: "do" | "undo";
  outcome: "ok" | "failed";
  error?: string;
}

interface SagaResult<C extends Record<string, unknown>> {
  state: SagaState;
  failedStep?: string;
  failedCompensator?: string;
  stepsExecuted: string[];
  compensationsRun: string[];
  log: SagaLogEvent[];
  context: C;
}

// ── Saga ────────────────────────────────────────────────────────────────────

class Saga<C extends Record<string, unknown>> {
  constructor(public readonly name: string, private readonly steps: Step<C, unknown>[]) {}

  async run(payload: C, _sagaId = "default"): Promise<SagaResult<C>> {
    const log: SagaLogEvent[] = [];
    const stepsExecuted: string[] = [];
    const completed: Array<{ step: Step<C, unknown>; output: unknown }> = [];

    for (const step of this.steps) {
      try {
        const output = await step.do(payload);
        completed.push({ step, output });
        stepsExecuted.push(step.name);
        log.push({ step: step.name, phase: "do", outcome: "ok" });
      } catch (err) {
        log.push({ step: step.name, phase: "do", outcome: "failed", error: (err as Error).message });
        // Compensate in reverse.
        const compensationsRun: string[] = [];
        for (let i = completed.length - 1; i >= 0; i--) {
          const { step: doneStep, output } = completed[i];
          if (!doneStep.undo) continue;
          try {
            await doneStep.undo(payload, output);
            compensationsRun.push(doneStep.name);
            log.push({ step: doneStep.name, phase: "undo", outcome: "ok" });
          } catch (cErr) {
            log.push({
              step: doneStep.name,
              phase: "undo",
              outcome: "failed",
              error: (cErr as Error).message,
            });
            return {
              state: "partially_compensated",
              failedStep: step.name,
              failedCompensator: doneStep.name,
              stepsExecuted,
              compensationsRun,
              log,
              context: payload,
            };
          }
        }
        return {
          state: "compensated",
          failedStep: step.name,
          stepsExecuted,
          compensationsRun,
          log,
          context: payload,
        };
      }
    }

    return { state: "completed", stepsExecuted, compensationsRun: [], log, context: payload };
  }
}

// ── Smoke runner: three scenarios mirroring the python sibling ──────────────

interface World {
  searchLocks: Set<string>;
  reservations: Map<string, string>;
  smsSent: string[];
}

interface Ctx extends Record<string, unknown> {
  originalReservationId: string;
  customerId: string;
  partySize: number;
}

function makeSteps(world: World, failAt: string | null = null, compFailAt: string | null = null): Step<Ctx, unknown>[] {
  const stepNames = ["lock_alts", "cancel_old", "book_new", "notify"];
  const fail = (name: string) => {
    if (failAt === name) throw new Error(`simulated failure at ${name}`);
  };
  const compFail = (name: string) => {
    if (compFailAt === name) throw new Error(`simulated compensator failure at ${name}`);
  };

  return [
    {
      name: "lock_alts",
      do: async (c) => {
        fail("lock_alts");
        world.searchLocks.add(c.customerId);
        return { locked: c.customerId };
      },
      undo: async (c) => {
        compFail("lock_alts");
        world.searchLocks.delete(c.customerId);
      },
    },
    {
      name: "cancel_old",
      do: async (c) => {
        fail("cancel_old");
        world.reservations.delete(c.originalReservationId);
        return { cancelled: c.originalReservationId };
      },
      undo: async (c) => {
        compFail("cancel_old");
        world.reservations.set(c.originalReservationId, "restored");
      },
    },
    {
      name: "book_new",
      do: async (c) => {
        fail("book_new");
        world.reservations.set("res_new", `for_${c.customerId}`);
        return { booked: "res_new" };
      },
      undo: async () => {
        compFail("book_new");
        world.reservations.delete("res_new");
      },
    },
    {
      name: "notify",
      do: async (c) => {
        fail("notify");
        world.smsSent.push(c.customerId);
        return { notified: c.customerId };
      },
    },
  ];
}

async function main(): Promise<void> {
  const payload: Ctx = { originalReservationId: "res_42", customerId: "cust_7", partySize: 4 };

  for (const scenario of [
    { label: "happy path", failAt: null, compFailAt: null },
    { label: "forward failure at cancel_old", failAt: "cancel_old", compFailAt: null },
    { label: "notify fails AND undo_cancel_old fails", failAt: "notify", compFailAt: "cancel_old" },
  ]) {
    const world: World = { searchLocks: new Set(), reservations: new Map([[payload.originalReservationId, "active"]]), smsSent: [] };
    const saga = new Saga("rebook", makeSteps(world, scenario.failAt, scenario.compFailAt));
    const result = await saga.run(payload);
    console.log(`\n=== ${scenario.label} ===`);
    console.log(JSON.stringify({
      state: result.state,
      failedStep: result.failedStep,
      failedCompensator: result.failedCompensator,
      stepsExecuted: result.stepsExecuted,
      compensationsRun: result.compensationsRun,
      worldReservations: [...world.reservations.keys()],
      worldSearchLocks: [...world.searchLocks],
      worldSmsSent: world.smsSent,
    }, null, 2));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { Saga, makeSteps };
export type { Step, SagaResult, SagaState, SagaLogEvent };
