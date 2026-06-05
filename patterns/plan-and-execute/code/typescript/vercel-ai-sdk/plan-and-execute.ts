/**
 * Plan-and-Execute — Vercel AI SDK variant.
 *
 * Pattern: Plan upfront (typed step list) then execute each step, optionally
 *   replanning on failure.
 * Framework: Vercel AI SDK (ai ^4.0.0) + @ai-sdk/anthropic (^1.0.0).
 * Idioms: generateObject() with a Zod Plan schema owns the planner step;
 *   the executor is a plain for-loop over steps that either runs a tool
 *   (when `tool` is set) or calls generateText() for the LLM-only steps.
 * Design doc: ../../../design.md (the framework-agnostic
 *   ../../python/plan_and_execute.py runs the same three-step plan against
 *   the same enterprise-LLM-adoption report task).
 *
 * Install:  pnpm add ai @ai-sdk/anthropic zod
 *           (or via tsx-on-demand: npx tsx plan-and-execute.ts)
 * Run:      ANTHROPIC_API_KEY=... npx tsx plan-and-execute.ts
 *
 * Note: ESM only.
 * tsconfig snippet: { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022" }
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, generateText } from "ai";
import { z } from "zod";

// ── Types ────────────────────────────────────────────────────────────────────

const PlanStep = z.object({
  step: z.number().int().min(1),
  description: z.string().min(1),
  tool: z.string().nullable().describe("Tool name, or null for an LLM-only step."),
});

const Plan = z.object({
  steps: z.array(PlanStep).min(1).max(8),
});

type PlanStepT = z.infer<typeof PlanStep>;

interface ExecutedStep extends PlanStepT {
  status: "ok" | "failed";
  output: string;
}

interface ExecutionResult {
  finalOutput: string;
  plan: ExecutedStep[];
  replanned: boolean;
}

type Tool = (arg: string) => Promise<string> | string;

// ── Planner ────────────────────────────────────────────────────────────────

const PLANNER_SYSTEM =
  "You decompose tasks into 2-5 ordered steps. Each step has a short " +
  "description and an optional tool name (null when no tool is needed). " +
  "Return the steps as a JSON object with a `steps` array.";

async function plan(task: string, toolNames: string[], model = anthropic("claude-haiku-4-5")) {
  const catalog = toolNames.length ? `Available tools: ${toolNames.join(", ")}.` : "No tools available.";
  const result = await generateObject({
    model,
    schema: Plan,
    system: PLANNER_SYSTEM,
    prompt: `Task: ${task}\n\n${catalog}\n\nProduce a JSON object with the step plan.`,
  });
  return result.object.steps;
}

// ── Executor ──────────────────────────────────────────────────────────────

async function execute(
  task: string,
  steps: PlanStepT[],
  tools: Record<string, Tool>,
  model = anthropic("claude-haiku-4-5"),
): Promise<ExecutedStep[]> {
  const out: ExecutedStep[] = [];
  let context = `Task: ${task}`;
  for (const step of steps) {
    try {
      let output: string;
      if (step.tool && tools[step.tool]) {
        output = await tools[step.tool](step.description);
      } else {
        const result = await generateText({
          model,
          system: "You are an executor running one step of a larger plan.",
          prompt: `${context}\n\nStep ${step.step}: ${step.description}\n\nProduce the step's output.`,
        });
        output = result.text;
      }
      out.push({ ...step, status: "ok", output });
      context = `${context}\n\nStep ${step.step} output:\n${output}`;
    } catch (err) {
      out.push({ ...step, status: "failed", output: (err as Error).message });
      break;
    }
  }
  return out;
}

// ── Public surface ───────────────────────────────────────────────────────────

export async function planAndExecute(
  task: string,
  tools: Record<string, Tool> = {},
): Promise<ExecutionResult> {
  const steps = await plan(task, Object.keys(tools));
  const executed = await execute(task, steps, tools);
  const final = executed.findLast((s) => s.status === "ok")?.output ?? "No output produced.";
  return { finalOutput: final, plan: executed, replanned: false };
}

// ── Smoke runner ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the planner + executor.");
    return;
  }

  const tools: Record<string, Tool> = {
    search: async (q) => `Search results: top 3 articles about '${q}'`,
  };

  const result = await planAndExecute(
    "Write a report on the adoption of LLM agents in enterprise software",
    tools,
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

export { Plan, PlanStep, plan, execute };
export type { PlanStepT, ExecutedStep, ExecutionResult, Tool };
