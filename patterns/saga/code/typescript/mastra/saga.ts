/**
 * Saga — Mastra variant.
 *
 * Pattern: Long-running multi-step process with explicit compensation. Each
 *   step is a (do, undo) pair; on failure, the coordinator walks completed
 *   steps in reverse and invokes each compensator. Three terminal states:
 *   completed | compensated | partially_compensated.
 * Framework: Mastra (@mastra/core ^0.1.0) + @ai-sdk/anthropic (^1.0.0).
 *   Mastra's `Workflow` primitive would also model this — but its rollback
 *   surface is still moving (see docs/frameworks/mastra.md#version-notes).
 *   The Saga shape here is plain TS so the (do, undo) contract stays
 *   visible; Mastra's role is the `coordinatorAgent` that can be slotted in
 *   to choose compensation strategies under uncertainty.
 * Design doc: ../../../design.md
 * Sibling: ../vercel-ai-sdk/saga.ts walks the same three scenarios (happy
 *   path, mid-saga compensation, compensator-itself-fails) with no Mastra
 *   import.
 *
 * Install:  pnpm add @mastra/core @ai-sdk/anthropic
 *           (or via tsx-on-demand: npx tsx saga.ts)
 * Run:      npx tsx saga.ts          # smoke runs offline — no API key needed
 *
 * Note: ESM only. Mastra is pre-1.0; pin tight per
 *   docs/frameworks/mastra.md#version-notes.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";

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

// ── Optional coordinator agent (for "should we compensate or escalate?") ─────

/** Available for projects that want the coordinator to consult an LLM when a
 *  step throws an ambiguous error. The Saga below does not invoke it — the
 *  default policy is "always compensate" — but the import is here so the
 *  framework's `Agent` surface is in the file. */
export const coordinatorAgent = new Agent({
  name: "saga-coordinator",
  model: anthropic("claude-haiku-4-5"),
  instructions:
    "You decide whether a failed saga step should trigger compensation, retry, " +
    "or human escalation. Be terse: emit one of {compensate, retry, escalate} " +
    "with a one-line reason.",
});

// ── Saga ────────────────────────────────────────────────────────────────────

export class Saga<C extends Record<string, unknown>> {
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
  const fail = (name: string) => { if (failAt === name) throw new Error(`simulated failure at ${name}`); };
  const compFail = (name: string) => { if (compFailAt === name) throw new Error(`simulated compensator failure at ${name}`); };

  return [
    {
      name: "lock_alts",
      do: async (c) => { fail("lock_alts"); world.searchLocks.add(c.customerId); return { locked: c.customerId }; },
      undo: async (c) => { compFail("lock_alts"); world.searchLocks.delete(c.customerId); },
    },
    {
      name: "cancel_old",
      do: async (c) => { fail("cancel_old"); world.reservations.delete(c.originalReservationId); return { cancelled: c.originalReservationId }; },
      undo: async (c) => { compFail("cancel_old"); world.reservations.set(c.originalReservationId, "restored"); },
    },
    {
      name: "book_new",
      do: async (c) => { fail("book_new"); world.reservations.set("res_new", `for_${c.customerId}`); return { booked: "res_new" }; },
      undo: async () => { compFail("book_new"); world.reservations.delete("res_new"); },
    },
    {
      name: "notify",
      do: async (c) => { fail("notify"); world.smsSent.push(c.customerId); return { notified: c.customerId }; },
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
      worldSmsSent: world.smsSent,
    }, null, 2));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

export { makeSteps };
export type { Step, SagaResult, SagaState, SagaLogEvent };
