/**
 * Human-in-the-Loop — Vercel AI SDK variant.
 *
 * Pattern: Approval gate — the agent proposes an action and yields until a
 *   human decision lands (approved / denied / modified) or the TTL fires
 *   (auto_approve / auto_deny / timed_out per policy).
 * Framework: Vercel AI SDK (ai ^4.0.0) + @ai-sdk/anthropic (^1.0.0). The
 *   model side proposes the action via generateObject() with a Zod-typed
 *   Proposal schema; the gate is plain TS so it slots into any HTTP /
 *   queue surface.
 * Idioms: structured proposal output → idempotent decision inbox → resolve
 *   via approve() / deny() / modify(), or settle when the TTL fires.
 *   Matches the core contract of ../../python/approval.py; the escalation
 *   chain and the Slack/web-queue surfaces in that sibling are out of scope
 *   here (link to that file for the extended example).
 * Design doc: ../../../design.md
 *
 * Install:  pnpm add ai @ai-sdk/anthropic zod
 *           (or via tsx-on-demand: npx tsx human-in-the-loop.ts)
 * Run:      ANTHROPIC_API_KEY=... npx tsx human-in-the-loop.ts
 *
 * Note: ESM only.
 * tsconfig snippet: { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022" }
 */

import { randomUUID } from "node:crypto";

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

// ── Types ────────────────────────────────────────────────────────────────────

type DecisionOutcome = "approved" | "denied" | "modified" | "timed_out";
type TimeoutPolicy = "auto_approve" | "auto_deny" | "timed_out";

interface Approval {
  proposalId: string;
  action: string;
  context: Record<string, unknown>;
  approverPool: string;
  ttlMs: number;
  onTimeout: TimeoutPolicy;
}

interface Decision {
  proposalId: string;
  outcome: DecisionOutcome;
  approver: string;
  decidedInMs: number;
  reason?: string;
  modification?: Record<string, unknown>;
}

// ── Idempotent inbox: first decision wins ───────────────────────────────────

class DecisionInbox {
  private decisions = new Map<string, Decision>();

  put(proposalId: string, partial: Omit<Decision, "proposalId" | "decidedInMs">, startedAt: number): boolean {
    if (this.decisions.has(proposalId)) return false;
    this.decisions.set(proposalId, {
      proposalId,
      decidedInMs: Date.now() - startedAt,
      ...partial,
    });
    return true;
  }

  poll(proposalId: string): Decision | undefined {
    return this.decisions.get(proposalId);
  }
}

// ── Gate ────────────────────────────────────────────────────────────────────

class ApprovalGate {
  private readonly inbox = new DecisionInbox();
  readonly deliveries: Approval[] = [];

  async requestApproval(req: Approval): Promise<Decision> {
    this.deliveries.push(req);
    const startedAt = Date.now();
    const deadline = startedAt + req.ttlMs;

    while (Date.now() < deadline) {
      const hit = this.inbox.poll(req.proposalId);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 25));
    }

    // TTL fired — settle per policy. Use the inbox so a late real decision
    // still loses to the auto-settled outcome.
    const settled: Omit<Decision, "proposalId" | "decidedInMs"> = {
      outcome: req.onTimeout === "timed_out" ? "timed_out" : req.onTimeout === "auto_approve" ? "approved" : "denied",
      approver: "system:ttl",
      reason: `ttl ${req.ttlMs}ms exceeded`,
    };
    this.inbox.put(req.proposalId, settled, startedAt);
    return this.inbox.poll(req.proposalId)!;
  }

  approve(proposalId: string, approver: string, startedAt: number): boolean {
    return this.inbox.put(proposalId, { outcome: "approved", approver }, startedAt);
  }

  deny(proposalId: string, approver: string, startedAt: number, reason?: string): boolean {
    return this.inbox.put(proposalId, { outcome: "denied", approver, reason }, startedAt);
  }

  modify(proposalId: string, approver: string, startedAt: number, modification: Record<string, unknown>): boolean {
    return this.inbox.put(proposalId, { outcome: "modified", approver, modification }, startedAt);
  }
}

// ── Model-side proposal ─────────────────────────────────────────────────────

const Proposal = z.object({
  action: z.string().describe("Short verb phrase naming the mutation, e.g. 'refund_payment'."),
  context: z.record(z.string()).describe("Approval context the human will see (account id, amount, etc.)."),
  rationale: z.string().describe("Why the model thinks this action should be taken."),
});

async function proposeAction(task: string): Promise<z.infer<typeof Proposal>> {
  const result = await generateObject({
    model: anthropic("claude-haiku-4-5"),
    schema: Proposal,
    system:
      "You are an agent that proposes one mutating action for human approval. " +
      "Never claim the action is complete — that decision belongs to the human.",
    prompt: task,
  });
  return result.object;
}

// ── Smoke runner ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const gate = new ApprovalGate();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Skipping model proposal — set ANTHROPIC_API_KEY to exercise generateObject().");
    // Exercise the gate offline so the dispatcher contract is visible.
    const startedAt = Date.now();
    const reqP = gate.requestApproval({
      proposalId: randomUUID(),
      action: "stub_action",
      context: { customer: "cust_42" },
      approverPool: "ops",
      ttlMs: 100,
      onTimeout: "timed_out",
    });
    const decision = await reqP;
    console.log(`Offline gate fired: ${decision.outcome} in ${decision.decidedInMs}ms`);
    return;
  }

  const proposal = await proposeAction(
    "The customer was double-charged $42.00 for invoice INV-9001 last Tuesday.",
  );
  console.log(`Proposed: ${proposal.action} (${proposal.rationale.slice(0, 60)})`);

  const proposalId = randomUUID();
  const startedAt = Date.now();
  // Simulate a human approver landing 50ms in.
  setTimeout(() => gate.approve(proposalId, "ops_alice", startedAt), 50);

  const decision = await gate.requestApproval({
    proposalId,
    action: proposal.action,
    context: proposal.context,
    approverPool: "ops",
    ttlMs: 500,
    onTimeout: "auto_deny",
  });
  console.log(`Decision: ${decision.outcome} by ${decision.approver} in ${decision.decidedInMs}ms`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { ApprovalGate, DecisionInbox, Proposal, proposeAction };
export type { Approval, Decision, DecisionOutcome, TimeoutPolicy };
