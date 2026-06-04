/**
 * ReAct — Vercel AI SDK variant.
 *
 * Pattern: ReAct (reason → act → observe loop with tools).
 * Framework: Vercel AI SDK (ai ^4.0.0) + @ai-sdk/anthropic (^1.0.0).
 * Idioms: generateText() with tools + maxSteps drives the ReAct loop; tools
 *   are declared with zod schemas and an async execute() callback.
 * Design doc: ../../../design.md (the framework-agnostic _reference.py at
 *   ../../_reference.py shows the loop control flow without a real LLM).
 *
 * Install:  pnpm add ai @ai-sdk/anthropic zod
 *           (or via tsx-on-demand: npx tsx react.ts)
 * Run:      ANTHROPIC_API_KEY=... npx tsx react.ts
 *
 * The Vercel AI SDK runs the ReAct loop when you pass `tools` + `maxSteps` to
 * generateText. The SDK handles tool dispatch, message threading, and step
 * counting. Contrast with the Python siblings under ../../python/.
 *
 * Note: ESM only (matches the canonical TypeScript project layout).
 * tsconfig snippet: { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022" }
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, tool } from "ai";
import { z } from "zod";

const MOCK_DICTIONARY: Record<string, string> = {
  recursion:
    "A method of solving a problem where the solution depends on solutions to smaller instances of the same problem.",
  monad:
    "A design pattern in functional programming that wraps values to chain operations while handling side effects.",
  agent:
    "An autonomous program that perceives its environment through inputs and acts on it through tools.",
};

const SYSTEM_PROMPT =
  "You are a dictionary agent. Given a word, call lookupDefinition exactly " +
  "once and then answer with the returned meaning. If the tool returns " +
  "'unknown', say so plainly instead of guessing.";

const tools = {
  lookupDefinition: tool({
    description: "Return the canonical definition of a word from the dictionary.",
    parameters: z.object({
      word: z.string().describe("The word to look up."),
    }),
    execute: async ({ word }: { word: string }) => {
      const key = word.toLowerCase();
      return MOCK_DICTIONARY[key] ?? `unknown: no entry for ${JSON.stringify(word)}`;
    },
  }),
};

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the real loop.");
    return;
  }

  const result = await generateText({
    model: anthropic("claude-haiku-4-5"),
    system: SYSTEM_PROMPT,
    tools,
    maxSteps: 4,
    prompt: "What does the word 'recursion' mean?",
  });

  console.log(`answer: ${result.text}`);
  console.log(`steps:  ${result.steps.length}`);
  for (const [i, step] of result.steps.entries()) {
    const toolNames = step.toolCalls.map((c) => c.toolName).join(", ") || "(none)";
    console.log(`  step ${i + 1}: tools=${toolNames}`);
  }
}

// ESM entry-point check.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
