/**
 * Parallel Calls — Vercel AI SDK variant.
 *
 * Pattern: Parallel Calls (fan out N independent LLM calls on chunks of
 *   input, then aggregate the outputs in a final call). Total wall-clock
 *   approximates the slowest branch.
 * Framework: Vercel AI SDK (ai ^4.0.0) + @ai-sdk/anthropic (^1.0.0).
 * Idioms: Promise.allSettled() for the fan-out so one branch failure
 *   doesn't cancel the others; one generateText() per branch + one for
 *   the aggregate.
 * Design doc: ../../../design.md (the framework-agnostic
 *   ../../python/parallel_calls.py runs the same four-section smoke).
 *
 * Install:  pnpm add ai @ai-sdk/anthropic
 *           (or via tsx-on-demand: npx tsx parallel-calls.ts)
 * Run:      ANTHROPIC_API_KEY=... npx tsx parallel-calls.ts
 *
 * Note: ESM only.
 * tsconfig snippet: { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022" }
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, type LanguageModelV1 } from "ai";

// ── Types ───────────────────────────────────────────────────────────────────

interface BranchResult {
  index: number;
  input: string;
  output: string;
  error: string | null;
}

interface ParallelResult {
  outputs: string[];
  aggregated: string;
  errors: BranchResult[];
}

// ── Driver ──────────────────────────────────────────────────────────────────

class ParallelCalls {
  constructor(
    private readonly system = "",
    private readonly model: LanguageModelV1 = anthropic("claude-haiku-4-5"),
  ) {}

  async run(
    chunks: string[],
    branchPrompt: string,
    aggregatePrompt: string,
  ): Promise<ParallelResult> {
    const settled = await Promise.allSettled(
      chunks.map((chunk, i) => this.callBranch(i, chunk, branchPrompt)),
    );

    const branchResults: BranchResult[] = settled.map((s, i) =>
      s.status === "fulfilled"
        ? s.value
        : { index: i, input: chunks[i], output: "", error: String(s.reason) },
    );

    const errors = branchResults.filter((r) => r.error !== null);
    const successes = branchResults.filter((r) => r.error === null);

    const combined = successes
      .map((r) => `[Part ${r.index + 1}]\n${r.output}`)
      .join("\n\n---\n\n");
    const aggregated = await generateText({
      model: this.model,
      system: this.system || undefined,
      prompt: aggregatePrompt.replace("{input}", combined),
    });

    return {
      outputs: successes.map((r) => r.output),
      aggregated: aggregated.text,
      errors,
    };
  }

  private async callBranch(
    index: number,
    chunk: string,
    branchPrompt: string,
  ): Promise<BranchResult> {
    const result = await generateText({
      model: this.model,
      system: this.system || undefined,
      prompt: branchPrompt.replace("{input}", chunk),
    });
    return { index, input: chunk, output: result.text, error: null };
  }
}

// ── Smoke runner ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the fan-out.");
    return;
  }

  const runner = new ParallelCalls();
  const sections = [
    "Section 1: Market analysis shows growth in Q3...",
    "Section 2: Technical architecture uses microservices...",
    "Section 3: Financial projections indicate 20% YoY...",
    "Section 4: Risk factors include regulatory changes...",
  ];

  const result = await runner.run(
    sections,
    "Summarize this section in one sentence:\n\n{input}",
    "Combine these section summaries into an executive overview:\n\n{input}",
  );

  console.log(`Branches completed: ${result.outputs.length}`);
  console.log(`Errors: ${result.errors.length}`);
  console.log(`\nAggregated:\n${result.aggregated}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { ParallelCalls };
export type { BranchResult, ParallelResult };
