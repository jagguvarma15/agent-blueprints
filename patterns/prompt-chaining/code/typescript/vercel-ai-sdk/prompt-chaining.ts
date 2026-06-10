/**
 * Prompt Chaining — Vercel AI SDK variant.
 *
 * Pattern: Prompt Chaining (sequential LLM calls where each step's output
 *   feeds the next; optional validator gates halt the chain on failure).
 * Framework: Vercel AI SDK (ai ^4.0.0) + @ai-sdk/anthropic (^1.0.0).
 * Idioms: generateText() per step; a tiny ChainStep type so the same
 *   driver works for any chain shape; validator callbacks return bool to
 *   short-circuit cleanly.
 * Design doc: ../../../design.md (the framework-agnostic
 *   ../../python/prompt_chaining.py runs the same three-step smoke:
 *   extract -> summarize -> format).
 *
 * Install:  pnpm add ai @ai-sdk/anthropic
 *           (or via tsx-on-demand: npx tsx prompt-chaining.ts)
 * Run:      ANTHROPIC_API_KEY=... npx tsx prompt-chaining.ts
 *
 * Note: ESM only.
 * tsconfig snippet: { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022" }
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, type LanguageModelV1 } from "ai";

// ── Types ───────────────────────────────────────────────────────────────────

interface ChainStep {
  name: string;
  // The chain feeds `{input}` from the prior step's output into the template.
  promptTemplate: string;
  // Return false to halt the chain at this step.
  validate?: (output: string) => boolean;
}

interface ChainResult {
  success: boolean;
  output: string;
  stepOutputs: string[];
  failedAt: string | null;
}

// ── Driver ──────────────────────────────────────────────────────────────────

class PromptChain {
  constructor(
    private readonly steps: ChainStep[],
    private readonly system = "",
    private readonly model: LanguageModelV1 = anthropic("claude-haiku-4-5"),
  ) {}

  async run(initialInput: string): Promise<ChainResult> {
    let current = initialInput;
    const stepOutputs: string[] = [];

    for (const step of this.steps) {
      const prompt = step.promptTemplate.replace("{input}", current);
      const result = await generateText({
        model: this.model,
        system: this.system || undefined,
        prompt,
      });
      const output = result.text;

      if (step.validate && !step.validate(output)) {
        return {
          success: false,
          output,
          stepOutputs,
          failedAt: step.name,
        };
      }
      stepOutputs.push(output);
      current = output;
    }

    return { success: true, output: current, stepOutputs, failedAt: null };
  }
}

// ── Smoke runner ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the chain.");
    return;
  }

  const chain = new PromptChain(
    [
      {
        name: "extract",
        promptTemplate: "Extract the key facts from this text:\n\n{input}",
        validate: (out) => out.length > 0,
      },
      {
        name: "summarize",
        promptTemplate: "Summarize these facts in 2-3 sentences:\n\n{input}",
      },
      {
        name: "format",
        promptTemplate: "Format this summary as a markdown bullet list:\n\n{input}",
      },
    ],
    "You are a precise document processor.",
  );

  const result = await chain.run(
    "AI is transforming healthcare through diagnostics and drug discovery.",
  );

  console.log(`Success: ${result.success}`);
  console.log(`Steps:   ${result.stepOutputs.length}`);
  console.log(`Output:\n${result.output}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { PromptChain };
export type { ChainStep, ChainResult };
