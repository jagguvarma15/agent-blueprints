/**
 * Orchestrator-Worker — Vercel AI SDK variant.
 *
 * Pattern: Orchestrator-Worker (the orchestrator LLM decomposes the task
 *   into worker-assigned sub-tasks; each sub-task runs against a worker's
 *   specialized system prompt; orchestrator synthesises the worker outputs
 *   into the final answer).
 * Framework: Vercel AI SDK (ai ^4.0.0) + @ai-sdk/anthropic (^1.0.0) + zod.
 * Idioms: generateObject() with a zod schema for the decompose turn (so
 *   the worker assignment is typed JSON, not free-text); generateText()
 *   for each worker and for the final synthesise.
 * Design doc: ../../../design.md (the framework-agnostic
 *   ../../python/orchestrator_worker.py runs the same smoke with three
 *   workers: researcher, writer, reviewer).
 *
 * Install:  pnpm add ai @ai-sdk/anthropic zod
 *           (or via tsx-on-demand: npx tsx orchestrator-worker.ts)
 * Run:      ANTHROPIC_API_KEY=... npx tsx orchestrator-worker.ts
 *
 * Note: ESM only.
 * tsconfig snippet: { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022" }
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, generateText, type LanguageModelV1 } from "ai";
import { z } from "zod";

// ── Types ───────────────────────────────────────────────────────────────────

interface Worker {
  name: string;
  description: string;
  systemPrompt: string;
}

interface SubTask {
  workerName: string;
  task: string;
}

interface WorkerResult {
  workerName: string;
  task: string;
  output: string;
}

interface OrchestratorResult {
  finalOutput: string;
  workerResults: WorkerResult[];
  subTasks: SubTask[];
}

const PlanSchema = z.object({
  steps: z.array(
    z.object({
      worker: z.string(),
      task: z.string(),
    }),
  ),
});

// ── Driver ──────────────────────────────────────────────────────────────────

class OrchestratorWorker {
  private readonly workers: Map<string, Worker>;

  constructor(
    workers: Worker[],
    private readonly orchestratorModel: LanguageModelV1 = anthropic("claude-sonnet-4-6"),
    private readonly workerModel: LanguageModelV1 = anthropic("claude-haiku-4-5"),
  ) {
    this.workers = new Map(workers.map((w) => [w.name, w]));
  }

  async run(task: string): Promise<OrchestratorResult> {
    const subTasks = await this.decompose(task);
    const workerResults: WorkerResult[] = [];
    for (const subTask of subTasks) {
      workerResults.push(await this.runWorker(subTask));
    }
    const finalOutput = await this.synthesise(task, workerResults);
    return { finalOutput, workerResults, subTasks };
  }

  private async decompose(task: string): Promise<SubTask[]> {
    const workerList = Array.from(this.workers.values())
      .map((w) => `- ${w.name}: ${w.description}`)
      .join("\n");

    const planResult = await generateObject({
      model: this.orchestratorModel,
      schema: PlanSchema,
      system: "You are a task orchestrator that decomposes work into sub-tasks for specialist workers.",
      prompt: `Available workers:\n${workerList}\n\nTask: ${task}\n\nReturn the decomposition.`,
    });

    return planResult.object.steps.map((s) => ({
      workerName: s.worker,
      task: s.task,
    }));
  }

  private async runWorker(subTask: SubTask): Promise<WorkerResult> {
    const worker = this.workers.get(subTask.workerName);
    const result = await generateText({
      model: this.workerModel,
      system: worker?.systemPrompt,
      prompt: subTask.task,
    });
    return {
      workerName: subTask.workerName,
      task: subTask.task,
      output: result.text,
    };
  }

  private async synthesise(task: string, results: WorkerResult[]): Promise<string> {
    const formatted = results
      .map((r) => `[${r.workerName}]\n${r.output}`)
      .join("\n\n");
    const result = await generateText({
      model: this.orchestratorModel,
      system: "You are a synthesiser. Combine worker outputs into a coherent final answer.",
      prompt: `Original task: ${task}\n\nWorker outputs:\n${formatted}\n\nProduce the final unified output.`,
    });
    return result.text;
  }
}

// ── Smoke runner ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the orchestrator.");
    return;
  }

  const system = new OrchestratorWorker([
    {
      name: "researcher",
      description: "Finds and summarises factual information.",
      systemPrompt: "You are a research specialist. Be factual and cite sources.",
    },
    {
      name: "writer",
      description: "Drafts clear, well-structured prose.",
      systemPrompt: "You are a professional writer. Be clear and concise.",
    },
    {
      name: "reviewer",
      description: "Reviews content for accuracy and quality.",
      systemPrompt: "You are a critical reviewer. Identify issues clearly.",
    },
  ]);

  const result = await system.run("Write a brief report on the current state of AI agents.");

  console.log(`Sub-tasks: ${result.subTasks.length}`);
  for (const wt of result.workerResults) {
    console.log(`  [${wt.workerName}] ${wt.output.slice(0, 60)}`);
  }
  console.log(`\nFinal output:\n${result.finalOutput}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { OrchestratorWorker };
export type { Worker, SubTask, WorkerResult, OrchestratorResult };
