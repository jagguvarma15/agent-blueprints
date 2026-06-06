/**
 * Multi-Agent — Mastra variant.
 *
 * Pattern: Supervisor agent delegates to specialized sub-agents and
 *   synthesizes their outputs.
 * Framework: Mastra (@mastra/core ^0.1.0) + @ai-sdk/anthropic (^1.0.0).
 * Idioms: One Mastra `Agent` per role (researcher / writer / reviewer / supervisor).
 *   The supervisor uses `generate({ output })` with a typed Delegation schema
 *   to pick the next sub-agent each round; the supervisor's tool list could
 *   expose the sub-agents as call-able tools — kept here as plain `.generate()`
 *   calls so the orchestration shape is visible without Mastra-internal magic.
 * Design doc: ../../../design.md
 * Sibling: ../vercel-ai-sdk/multi-agent.ts runs the same researcher → writer →
 *   reviewer delegation against the same enterprise-overview task with the
 *   Vercel AI SDK's `generateObject` / `generateText` instead.
 *
 * Install:  pnpm add @mastra/core @ai-sdk/anthropic zod
 *           (or via tsx-on-demand: npx tsx multi-agent.ts)
 * Run:      ANTHROPIC_API_KEY=... npx tsx multi-agent.ts
 *
 * Note: ESM only. Mastra is pre-1.0; pin tight per
 *   docs/frameworks/mastra.md#version-notes.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";

// ── Schemas ────────────────────────────────────────────────────────────────

const Delegation = z.object({
  done: z.boolean(),
  reason: z.string().optional(),
  next: z.array(z.object({
    agent: z.enum(["researcher", "writer", "reviewer"]),
    task: z.string().min(1),
  })),
});

interface DelegationLog {
  agentName: string;
  task: string;
  output: string;
}

interface MultiAgentResult {
  finalOutput: string;
  delegations: DelegationLog[];
  rounds: number;
}

// ── Agents ──────────────────────────────────────────────────────────────────

const researcher = new Agent({
  name: "researcher",
  model: anthropic("claude-haiku-4-5"),
  instructions: "You find and summarize factual information from sources. Be concise.",
});

const writer = new Agent({
  name: "writer",
  model: anthropic("claude-haiku-4-5"),
  instructions: "You write clear, structured content based on provided research.",
});

const reviewer = new Agent({
  name: "reviewer",
  model: anthropic("claude-haiku-4-5"),
  instructions: "You review content for accuracy, clarity, and completeness. Return a short verdict.",
});

const supervisor = new Agent({
  name: "supervisor",
  model: anthropic("claude-haiku-4-5"),
  instructions:
    "You are the supervisor of a multi-agent system. Each round, decide whether the task is " +
    "complete; if not, list the sub-agents to invoke and what each should do. Available agents: " +
    "researcher (finds info), writer (drafts content), reviewer (judges quality).",
});

const subAgentByName = { researcher, writer, reviewer } as const;
type SubAgentName = keyof typeof subAgentByName;

// ── Orchestration ──────────────────────────────────────────────────────────

export async function runMultiAgent(task: string, maxRounds = 4): Promise<MultiAgentResult> {
  const delegations: DelegationLog[] = [];

  for (let round = 1; round <= maxRounds; round++) {
    const log = delegations.map((d) => `[${d.agentName}] ${d.task} -> ${d.output.slice(0, 80)}`).join("\n") || "(none)";
    const decisionResp = await supervisor.generate(
      `Task: ${task}\n\nDelegations so far:\n${log}\n\nDecide next.`,
      { output: Delegation },
    );
    const decision = (decisionResp as { object: z.infer<typeof Delegation> }).object;

    if (decision.done) {
      const synth = await supervisor.generate(
        `Synthesize the final answer for: ${task}\n\nSub-agent outputs:\n${
          delegations.map((d) => `[${d.agentName}] ${d.output}`).join("\n\n")
        }`,
      );
      return {
        finalOutput: (synth as { text: string }).text,
        delegations,
        rounds: round,
      };
    }

    for (const call of decision.next) {
      const agent = subAgentByName[call.agent as SubAgentName];
      if (!agent) continue;
      const r = await agent.generate(call.task);
      delegations.push({
        agentName: call.agent,
        task: call.task,
        output: (r as { text: string }).text,
      });
    }
  }

  return {
    finalOutput: "Reached max rounds without supervisor signaling done.",
    delegations,
    rounds: maxRounds,
  };
}

// ── Smoke runner ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the supervisor decision loop.");
    return;
  }

  const result = await runMultiAgent(
    "Write a technical overview of LLM agent frameworks for a developer audience",
  );
  console.log(`Delegations: ${result.delegations.length}`);
  for (const d of result.delegations) {
    console.log(`  -> [${d.agentName}] ${d.task.slice(0, 60)}`);
  }
  console.log(`\nFinal output:\n${result.finalOutput.slice(0, 200)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { supervisor, researcher, writer, reviewer, Delegation };
export type { MultiAgentResult, DelegationLog };
