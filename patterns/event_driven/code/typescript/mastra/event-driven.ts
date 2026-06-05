/**
 * Event-Driven — Mastra variant.
 *
 * Pattern: Consume from a stream, dedupe via idempotency claims, run the
 *   agent handler per event, ACK / DLQ / release based on the handler's
 *   typed outcome.
 * Framework: Mastra (@mastra/core ^0.1.0) + @ai-sdk/anthropic (^1.0.0). The
 *   handler is a Mastra `Agent` so each event reasons under a stable system
 *   prompt and can later be swapped for a `Workflow` when the handler grows
 *   branches.
 * Idioms: typed event envelope → `IdempotencyStore` for dedupe → Mastra
 *   `Agent.generate({ output })` returns a typed Decision → consumer loop
 *   drives ACK / DLQ / release accordingly. The Mastra primitive here is
 *   the agent's typed-output mode; the consumer loop itself is plain TS
 *   because the broker side is framework-agnostic.
 * Design doc: ../../../design.md
 * Sibling: ../vercel-ai-sdk/event-driven.ts runs the same 5-event smoke
 *   (including a duplicate and a permanent-failure event) with the Vercel
 *   AI SDK shape instead.
 *
 * Install:  pnpm add @mastra/core @ai-sdk/anthropic zod
 *           (or via tsx-on-demand: npx tsx event-driven.ts)
 * Run:      ANTHROPIC_API_KEY=... npx tsx event-driven.ts
 *
 * Note: ESM only. Mastra is pre-1.0; pin tight per
 *   docs/frameworks/mastra.md#version-notes.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";

// ── Types ────────────────────────────────────────────────────────────────────

interface EventEnvelope {
  id: string;
  payload: Record<string, unknown>;
}

const HandlerDecision = z.object({
  outcome: z.enum(["ok", "retry", "permanent"]),
  action: z.string().optional(),
  reason: z.string().optional(),
});

interface ConsumerStats {
  seen: number;
  acked: number;
  deduped: number;
  dlq: number;
  errorsByClass: Record<string, number>;
}

// ── In-memory broker ───────────────────────────────────────────────────────

class InMemorySource {
  private inflight: EventEnvelope[];
  acked: string[] = [];
  dlqOut: Array<{ id: string; reason: string }> = [];

  constructor(events: EventEnvelope[]) {
    this.inflight = [...events];
  }
  async pull(): Promise<EventEnvelope | null> {
    return this.inflight.shift() ?? null;
  }
  async ack(id: string): Promise<void> {
    this.acked.push(id);
  }
  async dlq(id: string, reason: string): Promise<void> {
    this.dlqOut.push({ id, reason });
  }
}

class IdempotencyStore {
  private claims = new Map<string, "claimed" | "completed">();
  async tryClaim(key: string): Promise<boolean> {
    if (this.claims.has(key)) return false;
    this.claims.set(key, "claimed");
    return true;
  }
  async markCompleted(key: string): Promise<void> {
    this.claims.set(key, "completed");
  }
  async release(key: string): Promise<void> {
    if (this.claims.get(key) === "claimed") this.claims.delete(key);
  }
}

// ── Handler (Mastra agent) ─────────────────────────────────────────────────

const rebookingAgent = new Agent({
  name: "rebooker",
  model: anthropic("claude-haiku-4-5"),
  instructions:
    "You receive a single reservation event. Decide one outcome:\n" +
    "  - ok        — handled cleanly; emit a one-line action.\n" +
    "  - retry     — transient external failure; the broker will redeliver.\n" +
    "  - permanent — input is unrecoverable; send to DLQ with a reason.\n" +
    "Return the typed Decision object only.",
});

async function decide(envelope: EventEnvelope): Promise<z.infer<typeof HandlerDecision>> {
  const eventType = String(envelope.payload.event_type ?? "unknown");
  if (eventType !== "reservation.cancelled") return { outcome: "ok", action: "no-op" };
  if (envelope.payload.simulate_failure === "transient") {
    return { outcome: "retry", reason: "third-party API throttled" };
  }
  if (envelope.payload.simulate_failure === "permanent") {
    return { outcome: "permanent", reason: "customer_id not found" };
  }
  // Real path: ask the Mastra agent. Kept inert here so the smoke runs
  // without burning tokens on every event; un-comment to exercise the model.
  // const r = await rebookingAgent.generate(JSON.stringify(envelope.payload), { output: HandlerDecision });
  // return (r as { object: z.infer<typeof HandlerDecision> }).object;
  return { outcome: "ok", action: "rebooked res_42" };
}

// ── Consumer ──────────────────────────────────────────────────────────────

export async function runConsumer(events: EventEnvelope[], handlerName = "rebooker"): Promise<{
  stats: ConsumerStats;
  source: InMemorySource;
}> {
  const source = new InMemorySource(events);
  const store = new IdempotencyStore();
  const stats: ConsumerStats = { seen: 0, acked: 0, deduped: 0, dlq: 0, errorsByClass: {} };

  while (true) {
    const envelope = await source.pull();
    if (!envelope) break;
    stats.seen++;
    const claimKey = `${handlerName}:${envelope.id}`;
    if (!(await store.tryClaim(claimKey))) {
      stats.deduped++;
      await source.ack(envelope.id);
      continue;
    }

    const decision = await decide(envelope);
    if (decision.outcome === "ok") {
      await store.markCompleted(claimKey);
      await source.ack(envelope.id);
      stats.acked++;
    } else if (decision.outcome === "retry") {
      await store.release(claimKey);
      stats.errorsByClass.retry = (stats.errorsByClass.retry ?? 0) + 1;
      // Real broker semantics: redeliver. In-memory we don't re-enqueue, so
      // the smoke's `retry` outcome is a single observation.
    } else {
      await store.markCompleted(claimKey);
      await source.dlq(envelope.id, decision.reason ?? "unknown");
      stats.dlq++;
      stats.errorsByClass.permanent = (stats.errorsByClass.permanent ?? 0) + 1;
    }
  }

  return { stats, source };
}

// ── Smoke runner ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const events: EventEnvelope[] = [
    { id: "evt_001", payload: { event_type: "reservation.cancelled", reservation_id: "res_1" } },
    { id: "evt_002", payload: { event_type: "reservation.cancelled", reservation_id: "res_2" } },
    { id: "evt_003", payload: { event_type: "reservation.cancelled", simulate_failure: "permanent" } },
    { id: "evt_004", payload: { event_type: "reservation.no_show", reservation_id: "res_4" } },
    { id: "evt_001", payload: { event_type: "reservation.cancelled", reservation_id: "res_1" } }, // duplicate
  ];

  const { stats, source } = await runConsumer(events);
  console.log(JSON.stringify({
    seen: stats.seen,
    acked: stats.acked,
    deduped: stats.deduped,
    dlq: stats.dlq,
    errorsByClass: stats.errorsByClass,
    acked_envelopes: source.acked,
    dlq_envelopes: source.dlqOut,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { rebookingAgent, IdempotencyStore, InMemorySource, decide, HandlerDecision };
export type { EventEnvelope, ConsumerStats };
