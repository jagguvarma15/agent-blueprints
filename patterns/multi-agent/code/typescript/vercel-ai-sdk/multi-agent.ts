/**
 * Multi-Agent — Vercel AI SDK variant.
 *
 * Pattern: Supervisor agent receives a task, decides which sub-agents to
 *   invoke and in what order, collects outputs, synthesizes the final result.
 * Framework: Vercel AI SDK (ai ^4.0.0) + @ai-sdk/anthropic (^1.0.0).
 * Idioms: generateObject() with a Zod Delegation schema owns the supervisor's
 *   "which agents do I call next" decision; each sub-agent is a plain
 *   `(task, context) => Promise<string>` function (could itself wrap generateText).
 *   No tools / no agent loop on the supervisor — the structured-output mode is
 *   the orchestration primitive.
 * Design doc: ../../../design.md (the framework-agnostic
 *   ../../python/multi_agent.py runs the same researcher → writer → reviewer
 *   delegation against the same enterprise-overview task).
 *
 * Install:  pnpm add ai @ai-sdk/anthropic zod
 *           (or via tsx-on-demand: npx tsx multi-agent.ts)
 * Run:      ANTHROPIC_API_KEY=... npx tsx multi-agent.ts
 *
 * Note: ESM only.
 * tsconfig snippet: { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022" }
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, generateText } from "ai";
import { z } from "zod";

// ── Types ────────────────────────────────────────────────────────────────────

interface SubAgent {
  name: string;
  description: string;
  run: (task: string, context: string) => Promise<string>;
}

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

// ── Supervisor schema ───────────────────────────────────────────────────────

const Delegation = z.object({
  done: z.boolean().describe("True when the supervisor judges the task is complete."),
  reason: z.string().optional(),
  next: z
    .array(z.object({
      agent: z.string().describe("Sub-agent name from the catalog."),
      task: z.string().describe("Sub-task description for that agent."),
    }))
    .describe("Sub-agents to invoke this round. Empty when `done` is true."),
});

function supervisorPrompt(agents: SubAgent[]): string {
  const catalog = agents.map((a) => `- ${a.name}: ${a.description}`).join("\n");
  return (
    "You are the supervisor of a multi-agent system. Each round, decide " +
    "whether the task is complete; if not, list the sub-agents to invoke " +
    "and what each should do. Return a JSON object with `done`, `reason`, " +
    `and \`next\`.\n\nAvailable agents:\n${catalog}`
  );
}

// ── System ──────────────────────────────────────────────────────────────────

interface MultiAgentOptions {
  agents: SubAgent[];
  maxRounds?: number;
}

class MultiAgentSystem {
  private readonly byName: Map<string, SubAgent>;

  constructor(
    private readonly opts: MultiAgentOptions,
    private readonly model = anthropic("claude-haiku-4-5"),
  ) {
    this.byName = new Map(opts.agents.map((a) => [a.name, a]));
    this.opts.maxRounds ??= 4;
  }

  async run(task: string): Promise<MultiAgentResult> {
    const delegations: DelegationLog[] = [];
    let context = "";

    for (let round = 1; round <= (this.opts.maxRounds ?? 4); round++) {
      const decision = await generateObject({
        model: this.model,
        schema: Delegation,
        system: supervisorPrompt(this.opts.agents),
        prompt: `Task: ${task}\n\nDelegations so far:\n${
          delegations.map((d) => `[${d.agentName}] ${d.task} -> ${d.output.slice(0, 80)}`).join("\n") || "(none)"
        }\n\nDecide next.`,
      });

      if (decision.object.done) {
        const final = await generateText({
          model: this.model,
          system: "You synthesize the final answer from the sub-agents' outputs.",
          prompt: `Task: ${task}\n\nSub-agent outputs:\n${delegations.map((d) => `[${d.agentName}] ${d.output}`).join("\n\n")}`,
        });
        return { finalOutput: final.text, delegations, rounds: round };
      }

      for (const call of decision.object.next) {
        const agent = this.byName.get(call.agent);
        if (!agent) continue;
        const output = await agent.run(call.task, context);
        delegations.push({ agentName: agent.name, task: call.task, output });
        context = `${context}\n\n[${agent.name}] ${output}`.trim();
      }
    }

    return {
      finalOutput: "Reached max rounds without supervisor signaling done.",
      delegations,
      rounds: this.opts.maxRounds ?? 4,
    };
  }
}

// ── Smoke runner ────────────────────────────────────────────────────────────

const makeAgentFn = (name: string) => async (task: string, ctx: string): Promise<string> =>
  `[${name} output] Task: ${task.slice(0, 50)} | Context: ${ctx.slice(0, 30) || "none"}`;

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the supervisor decision loop.");
    return;
  }

  const system = new MultiAgentSystem({
    agents: [
      { name: "researcher", description: "Finds and summarizes factual information from sources", run: makeAgentFn("researcher") },
      { name: "writer", description: "Writes clear, structured content based on provided research", run: makeAgentFn("writer") },
      { name: "reviewer", description: "Reviews content for accuracy, clarity, and completeness", run: makeAgentFn("reviewer") },
    ],
    maxRounds: 4,
  });

  const result = await system.run("Write a technical overview of LLM agent frameworks for a developer audience");
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

export { MultiAgentSystem, Delegation, makeAgentFn };
export type { SubAgent, MultiAgentOptions, MultiAgentResult, DelegationLog };
