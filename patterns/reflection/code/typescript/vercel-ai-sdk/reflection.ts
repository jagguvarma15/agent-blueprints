/**
 * Reflection — Vercel AI SDK variant.
 *
 * Pattern: Reflection (draft → critique → revise loop, capped by iterations).
 * Framework: Vercel AI SDK (ai ^4.0.0) + @ai-sdk/anthropic (^1.0.0).
 * Idioms: generateText() for the drafter, generateObject() with a Zod-typed
 *   Critique schema for the critic so VERDICT / ISSUES / SUGGESTION come
 *   back as structured fields, not free-text the caller has to parse.
 * Design doc: ../../../design.md (the framework-agnostic
 *   ../../python/reflection.py parses the critic's VERDICT/ISSUES/SUGGESTION
 *   prose by hand; the SDK's structured-output mode gives us the same
 *   contract without the parser).
 *
 * Install:  pnpm add ai @ai-sdk/anthropic zod
 *           (or via tsx-on-demand: npx tsx reflection.ts)
 * Run:      ANTHROPIC_API_KEY=... npx tsx reflection.ts
 *
 * Note: ESM only.
 * tsconfig snippet: { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022" }
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, generateText } from "ai";
import { z } from "zod";

// ── Types ────────────────────────────────────────────────────────────────────

interface ReflectionStep {
  iteration: number;
  draft: string;
  critique: string;
  passed: boolean;
  issues: string[];
  suggestion: string;
}

interface ReflectionResult {
  finalOutput: string;
  passed: boolean;
  iterations: ReflectionStep[];
}

// ── Schemas ─────────────────────────────────────────────────────────────────

const Critique = z.object({
  verdict: z.enum(["pass", "revise"]).describe("'pass' if the draft meets the criteria; 'revise' otherwise."),
  issues: z.array(z.string()).describe("Specific problems with the draft. Empty when verdict is 'pass'."),
  suggestion: z.string().describe("One actionable change for the reviser, or 'none' when passing."),
});

// ── Reflection agent ────────────────────────────────────────────────────────

interface ReflectionOptions {
  criteria: string;
  maxIterations?: number;
  system?: string;
}

class ReflectionAgent {
  constructor(
    private readonly opts: ReflectionOptions,
    private readonly model = anthropic("claude-haiku-4-5"),
  ) {
    this.opts.maxIterations ??= 3;
    this.opts.system ??= "You are a careful writer.";
  }

  private async draft(task: string, previousDraft?: string, suggestion?: string): Promise<string> {
    const prompt = previousDraft
      ? `Revise this draft to address the feedback.\n\nTask: ${task}\n\nPrevious draft:\n${previousDraft}\n\nFeedback to address:\n${suggestion}`
      : `Task: ${task}`;
    const result = await generateText({
      model: this.model,
      system: this.opts.system!,
      prompt,
    });
    return result.text;
  }

  private async critique(task: string, draft: string): Promise<z.infer<typeof Critique>> {
    const result = await generateObject({
      model: this.model,
      schema: Critique,
      system: `You are a strict reviewer. Criteria: ${this.opts.criteria}`,
      prompt: `Task: ${task}\n\nDraft:\n${draft}\n\nReview the draft against the criteria.`,
    });
    return result.object;
  }

  async run(task: string): Promise<ReflectionResult> {
    const iterations: ReflectionStep[] = [];
    let draft = await this.draft(task);

    for (let i = 1; i <= (this.opts.maxIterations ?? 3); i++) {
      const c = await this.critique(task, draft);
      const passed = c.verdict === "pass";
      iterations.push({
        iteration: i,
        draft,
        critique: `${c.verdict}: ${c.suggestion}`,
        passed,
        issues: c.issues,
        suggestion: c.suggestion,
      });
      if (passed) {
        return { finalOutput: draft, passed: true, iterations };
      }
      draft = await this.draft(task, draft, c.suggestion);
    }

    return { finalOutput: draft, passed: false, iterations };
  }
}

// ── Smoke runner ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the draft/critique loop.");
    return;
  }

  const agent = new ReflectionAgent({
    criteria: "Must be accurate, include a code example, and be under 200 words.",
    maxIterations: 3,
    system: "You are a technical writer.",
  });

  const result = await agent.run("Explain what a context window is in LLMs");
  console.log(`Passed: ${result.passed}`);
  console.log(`Iterations: ${result.iterations.length}`);
  for (const step of result.iterations) {
    const mark = step.passed ? "pass" : "revise";
    console.log(`  Iter ${step.iteration}: ${mark}  ${step.suggestion.slice(0, 60)}`);
  }
  console.log(`\nFinal output:\n${result.finalOutput.slice(0, 200)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { ReflectionAgent, Critique };
export type { ReflectionOptions, ReflectionResult, ReflectionStep };
