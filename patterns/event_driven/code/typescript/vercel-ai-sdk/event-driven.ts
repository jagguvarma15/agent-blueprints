/**
 * Event-Driven — Vercel AI SDK variant.
 *
 * Pattern: Consume from a stream, dedupe via idempotency claims, run the
 *   agent handler, persist + ACK on success, DLQ on permanent failure,
 *   release the claim on retryable failure so the next poll picks it back up.
 * Framework: Vercel AI SDK (ai ^4.0.0) + @ai-sdk/anthropic (^1.0.0). The
 *   handler side is a plain function — could itself wrap generateText() —
 *   so the consumer loop stays framework-agnostic.
 * Idioms: typed event envelope → in-memory `IdempotencyStore` for the dedupe
 *   contract → handler.run() returns either ok/retry/permanent → consumer
 *   loop drives ACK/DLQ/release accordingly.
 * Design doc: ../../../design.md (the framework-agnostic
 *   ../../python/event_driven.py runs the same 5-event smoke including a
 *   duplicate and a permanent-failure event).
 *
 * Install:  pnpm add ai @ai-sdk/anthropic
 *           (or via tsx-on-demand: npx tsx event-driven.ts)
 * Run:      ANTHROPIC_API_KEY=... npx tsx event-driven.ts
 *
 * Note: ESM only.
 * tsconfig snippet: { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022" }
 */

// ── Types ────────────────────────────────────────────────────────────────────

type HandlerOutcome =
  | { kind: "ok"; result: Record<string, unknown> }
  | { kind: "retry"; reason: string }
  | { kind: "permanent"; reason: string };

interface EventEnvelope {
  id: string;
  payload: Record<string, unknown>;
}

interface Handler {
  run(eventType: string, payload: Record<string, unknown>): Promise<HandlerOutcome>;
}

interface Source {
  pull(blockMs: number): Promise<EventEnvelope | null>;
  ack(id: string): Promise<void>;
  dlq(id: string, reason: string): Promise<void>;
  release(id: string): Promise<void>;
}

interface ConsumerStats {
  seen: number;
  acked: number;
  deduped: number;
  dlq: number;
  errorsByClass: Record<string, number>;
}

// ── In-memory implementations ──────────────────────────────────────────────

class InMemorySource implements Source {
  private inflight: EventEnvelope[];
  private acked: string[] = [];
  private dlqOut: Array<{ id: string; reason: string }> = [];

  constructor(events: EventEnvelope[]) {
    this.inflight = [...events];
  }

  async pull(_blockMs: number): Promise<EventEnvelope | null> {
    return this.inflight.shift() ?? null;
  }
  async ack(id: string): Promise<void> {
    this.acked.push(id);
  }
  async dlq(id: string, reason: string): Promise<void> {
    this.dlqOut.push({ id, reason });
  }
  async release(envelope: string | EventEnvelope): Promise<void> {
    if (typeof envelope !== "string") this.inflight.push(envelope);
  }
  drained(): { acked: string[]; dlq: Array<{ id: string; reason: string }> } {
    return { acked: this.acked, dlq: this.dlqOut };
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

// ── Consumer ──────────────────────────────────────────────────────────────

class EventDrivenConsumer {
  readonly stats: ConsumerStats = { seen: 0, acked: 0, deduped: 0, dlq: 0, errorsByClass: {} };
  private stopped = false;

  constructor(
    private readonly source: InMemorySource,
    private readonly store: IdempotencyStore,
    private readonly handler: Handler,
    private readonly handlerName: string,
    private readonly blockMs = 50,
  ) {}

  stop(): void {
    this.stopped = true;
  }

  async runUntilStopped(): Promise<void> {
    while (!this.stopped) {
      const envelope = await this.source.pull(this.blockMs);
      if (!envelope) continue;
      this.stats.seen++;

      const claimKey = `${this.handlerName}:${envelope.id}`;
      const claimed = await this.store.tryClaim(claimKey);
      if (!claimed) {
        this.stats.deduped++;
        await this.source.ack(envelope.id);
        continue;
      }

      const eventType = String(envelope.payload.event_type ?? "unknown");
      const outcome = await this.handler.run(eventType, envelope.payload);

      if (outcome.kind === "ok") {
        await this.store.markCompleted(claimKey);
        await this.source.ack(envelope.id);
        this.stats.acked++;
      } else if (outcome.kind === "retry") {
        await this.store.release(claimKey);
        // Source-side re-queue: in production this is the broker's redelivery
        // semantics. In-memory we noop and let the next pull pick it back up.
        this.stats.errorsByClass.retry = (this.stats.errorsByClass.retry ?? 0) + 1;
      } else {
        await this.source.dlq(envelope.id, outcome.reason);
        await this.store.markCompleted(claimKey);
        this.stats.dlq++;
        this.stats.errorsByClass.permanent = (this.stats.errorsByClass.permanent ?? 0) + 1;
      }
    }
  }
}

// ── Smoke runner ────────────────────────────────────────────────────────────

const rebookingHandler: Handler = {
  async run(eventType, payload) {
    if (eventType !== "reservation.cancelled") return { kind: "ok", result: { action: "no-op" } };
    if (payload.simulate_failure === "transient") return { kind: "retry", reason: "third-party API throttled" };
    if (payload.simulate_failure === "permanent") return { kind: "permanent", reason: "customer_id not found" };
    return { kind: "ok", result: { action: "rebooked", new_reservation_id: "res_42" } };
  },
};

async function main(): Promise<void> {
  const events: EventEnvelope[] = [
    { id: "evt_001", payload: { event_type: "reservation.cancelled", reservation_id: "res_1" } },
    { id: "evt_002", payload: { event_type: "reservation.cancelled", reservation_id: "res_2" } },
    { id: "evt_003", payload: { event_type: "reservation.cancelled", simulate_failure: "permanent" } },
    { id: "evt_004", payload: { event_type: "reservation.no_show", reservation_id: "res_4" } },
    { id: "evt_001", payload: { event_type: "reservation.cancelled", reservation_id: "res_1" } }, // duplicate
  ];

  const source = new InMemorySource(events);
  const consumer = new EventDrivenConsumer(source, new IdempotencyStore(), rebookingHandler, "rebooker", 25);

  // Stop once the queue drains.
  const stopper = (async () => {
    await new Promise((r) => setTimeout(r, 200));
    consumer.stop();
  })();

  await Promise.all([consumer.runUntilStopped(), stopper]);

  console.log(JSON.stringify({
    seen: consumer.stats.seen,
    acked: consumer.stats.acked,
    deduped: consumer.stats.deduped,
    dlq: consumer.stats.dlq,
    errorsByClass: consumer.stats.errorsByClass,
    drained: source.drained(),
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { EventDrivenConsumer, IdempotencyStore, InMemorySource, rebookingHandler };
export type { EventEnvelope, Handler, HandlerOutcome, Source, ConsumerStats };
