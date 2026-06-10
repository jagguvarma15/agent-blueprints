/**
 * Evaluator-Optimizer — Vercel AI SDK variant.
 *
 * Pattern: Evaluator-Optimizer (generator produces output; evaluator scores
 *   it against explicit criteria; if the score is below threshold the
 *   generator improves against the feedback; loops to a cap).
 * Framework: Vercel AI SDK (ai ^4.0.0) + @ai-sdk/anthropic (^1.0.0) + zod.
 * Idioms: generateText() for the generator's turns; generateObject() with
 *   a zod EvalSchema for the evaluator's turn so the score / feedback /
 *   pass tuple comes back typed instead of free-text the caller must parse.
 * Design doc: ../../../design.md (the framework-agnostic
 *   ../../python/evaluator_optimizer.py runs the same loop until the
 *   evaluator score crosses the threshold or max_iterations).
 *
 * Install:  pnpm add ai @ai-sdk/anthropic zod
 *           (or via tsx-on-demand: npx tsx evaluator-optimizer.ts)
 * Run:      ANTHROPIC_API_KEY=... npx tsx evaluator-optimizer.ts
 *
 * Note: ESM only.
 * tsconfig snippet: { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022" }
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, generateText, type LanguageModelV1 } from "ai";
import { z } from "zod";

// ── Types ───────────────────────────────────────────────────────────────────

interface IterationRecord {
  number: number;
  output: string;
  score: number;
  feedback: string;
  passed: boolean;
}

interface EvalResult {
  finalOutput: string;
  passed: boolean;
  iterations: IterationRecord[];
  finalScore: number;
}

const EvalSchema = z.object({
  score: z.number().min(0).max(1),
  feedback: z.string(),
  passed: z.boolean(),
});

// ── Driver ──────────────────────────────────────────────────────────────────

class EvaluatorOptimizer {
  constructor(
    private readonly criteria: string,
    private readonly options: {
      threshold?: number;
      maxIterations?: number;
      generatorModel?: LanguageModelV1;
      evaluatorModel?: LanguageModelV1;
    } = {},
  ) {}

  private get threshold(): number {
    return this.options.threshold ?? 0.8;
  }

  private get maxIterations(): number {
    return this.options.maxIterations ?? 3;
  }

  private get generatorModel(): LanguageModelV1 {
    return this.options.generatorModel ?? anthropic("claude-sonnet-4-6");
  }

  private get evaluatorModel(): LanguageModelV1 {
    // Evaluator should outclass the generator where possible; falls back to
    // sonnet so a single API key configures both.
    return this.options.evaluatorModel ?? anthropic("claude-opus-4-7");
  }

  async run(task: string): Promise<EvalResult> {
    const iterations: IterationRecord[] = [];
    let previous: string | null = null;
    let lastFeedback: string | null = null;

    for (let i = 0; i < this.maxIterations; i++) {
      const output = await this.generate(task, previous, lastFeedback);
      const evaluation = await this.evaluate(output);
      const record: IterationRecord = {
        number: i + 1,
        output,
        score: evaluation.score,
        feedback: evaluation.feedback,
        passed: evaluation.passed,
      };
      iterations.push(record);

      if (record.passed || record.score >= this.threshold) {
        return {
          finalOutput: output,
          passed: true,
          iterations,
          finalScore: record.score,
        };
      }

      previous = output;
      lastFeedback = evaluation.feedback;
    }

    const last = iterations[iterations.length - 1];
    return {
      finalOutput: last?.output ?? "",
      passed: false,
      iterations,
      finalScore: last?.score ?? 0,
    };
  }

  private async generate(
    task: string,
    previous: string | null,
    feedback: string | null,
  ): Promise<string> {
    const prompt =
      previous === null
        ? task
        : `Original task: ${task}\nCurrent output: ${previous}\nFeedback: ${feedback}\n\nProduce an improved version that addresses every feedback point.`;
    const result = await generateText({
      model: this.generatorModel,
      prompt,
    });
    return result.text;
  }

  private async evaluate(output: string): Promise<z.infer<typeof EvalSchema>> {
    const result = await generateObject({
      model: this.evaluatorModel,
      schema: EvalSchema,
      system:
        "You are an evaluator. Score the output against the criteria, return concrete actionable feedback, and decide whether it passes.",
      prompt: `Criteria:\n${this.criteria}\n\nOutput:\n${output}`,
    });
    return result.object;
  }
}

// ── Smoke runner ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(
      "Skipping smoke run — set ANTHROPIC_API_KEY to exercise the evaluate-optimise loop.",
    );
    return;
  }

  const eo = new EvaluatorOptimizer(
    "Must be clear, accurate, and under 100 words.",
    { threshold: 0.8, maxIterations: 3 },
  );

  const result = await eo.run("Explain what a transformer neural network is.");

  console.log(`Passed:      ${result.passed}`);
  console.log(`Iterations:  ${result.iterations.length}`);
  console.log(`Final score: ${result.finalScore.toFixed(2)}`);
  console.log(`Output:\n${result.finalOutput}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { EvaluatorOptimizer };
export type { IterationRecord, EvalResult };
