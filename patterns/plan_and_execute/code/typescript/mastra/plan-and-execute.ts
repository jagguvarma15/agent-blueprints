/**
 * Plan-and-Execute — Mastra variant.
 *
 * Pattern: Plan upfront (typed step list) then execute each step.
 * Framework: Mastra (@mastra/core ^0.1.0) + @ai-sdk/anthropic (^1.0.0).
 * Idioms: Two Mastra `Agent` instances — `plannerAgent` produces the typed
 *   Plan via the `generate({ output })` schema mode; `executorAgent` runs
 *   each step. No `Workflow` here: the executor loop is plain TS so the
 *   step-replan boundary is explicit and inspectable. Reach for Workflow
 *   only when steps need branching / parallel / durable resumption.
 * Design doc: ../../../design.md
 * Sibling: ../vercel-ai-sdk/plan-and-execute.ts walks the same three-step
 *   plan against the same enterprise-LLM-adoption task with the Vercel AI
 *   SDK's `generateObject` instead of Mastra's `Agent.generate({output})`.
 *
 * Install:  pnpm add @mastra/core @ai-sdk/anthropic zod
 *           (or via tsx-on-demand: npx tsx plan-and-execute.ts)
 * Run:      ANTHROPIC_API_KEY=... npx tsx plan-and-execute.ts
 *
 * Note: ESM only. Mastra is pre-1.0; pin tight per
 *   docs/frameworks/mastra.md#version-notes.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";

// ── Schemas ────────────────────────────────────────────────────────────────

const PlanStep = z.object({
  step: z.number().int().min(1),
  description: z.string().min(1),
  tool: z.string().nullable(),
});

const Plan = z.object({ steps: z.array(PlanStep).min(1).max(8) });

type PlanStepT = z.infer<typeof PlanStep>;

interface ExecutedStep extends PlanStepT {
  status: "ok" | "failed";
  output: string;
}

interface ExecutionResult {
  finalOutput: string;
  plan: ExecutedStep[];
}

type Tool = (arg: string) => Promise<string> | string;

// ── Agents ──────────────────────────────────────────────────────────────────

const plannerAgent = new Agent({
  name: "planner",
  model: anthropic("claude-haiku-4-5"),
  instructions:
    "You decompose tasks into 2-5 ordered steps. Each step has a short " +
    "description and an optional tool name. Return strictly typed JSON " +
    "matching the provided schema.",
});

const executorAgent = new Agent({
  name: "executor",
  model: anthropic("claude-haiku-4-5"),
  instructions: "You execute one step of a larger plan and return only that step's output.",
});

// ── Public surface ──────────────────────────────────────────────────────────

export async function planAndExecute(
  task: string,
  tools: Record<string, Tool> = {},
): Promise<ExecutionResult> {
  const catalog = Object.keys(tools).length ? `Available tools: ${Object.keys(tools).join(", ")}.` : "No tools available.";

  const planResponse = await plannerAgent.generate(
    `Task: ${task}\n\n${catalog}\n\nProduce the step plan.`,
    { output: Plan },
  );
  const plan = (planResponse as { object: z.infer<typeof Plan> }).object;

  const executed: ExecutedStep[] = [];
  let context = `Task: ${task}`;
  for (const step of plan.steps) {
    try {
      let output: string;
      if (step.tool && tools[step.tool]) {
        output = await tools[step.tool](step.description);
      } else {
        const r = await executorAgent.generate(
          `${context}\n\nStep ${step.step}: ${step.description}\n\nProduce the step's output.`,
        );
        output = (r as { text: string }).text;
      }
      executed.push({ ...step, status: "ok", output });
      context = `${context}\n\nStep ${step.step} output:\n${output}`;
    } catch (err) {
      executed.push({ ...step, status: "failed", output: (err as Error).message });
      break;
    }
  }

  const final = executed.findLast((s) => s.status === "ok")?.output ?? "No output produced.";
  return { finalOutput: final, plan: executed };
}

// ── Smoke runner ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the Mastra Agent calls.");
    return;
  }

  const result = await planAndExecute(
    "Write a report on the adoption of LLM agents in enterprise software",
    { search: async (q) => `Search results: top 3 articles about '${q}'` },
  );

  console.log(`Steps planned: ${result.plan.length}`);
  for (const step of result.plan) {
    console.log(`  [${step.status}] Step ${step.step}: ${step.description}`);
  }
  console.log(`\nFinal output:\n${result.finalOutput.slice(0, 200)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { plannerAgent, executorAgent, Plan, PlanStep };
export type { PlanStepT, ExecutedStep, ExecutionResult, Tool };
