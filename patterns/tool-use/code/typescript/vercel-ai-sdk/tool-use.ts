/**
 * Tool Use — Vercel AI SDK variant.
 *
 * Pattern: Tool Use (structured function calling with schema-validated dispatch).
 * Framework: Vercel AI SDK (ai ^4.0.0) + @ai-sdk/anthropic (^1.0.0).
 * Idioms: generateText() with tools dispatches per-tool execute() callbacks
 *   under Zod-validated parameters; maxSteps caps the round trip count.
 * Design doc: ../../../design.md (the framework-agnostic ../../python/tool_use.py
 *   shows the dispatcher shape that the SDK owns for us here).
 *
 * Install:  pnpm add ai @ai-sdk/anthropic zod
 *           (or via tsx-on-demand: npx tsx tool-use.ts)
 * Run:      ANTHROPIC_API_KEY=... npx tsx tool-use.ts
 *
 * Where ReAct emphasizes the reason → act → observe loop, Tool Use is about
 * the contract: the model speaks JSON tool calls, the framework dispatches
 * them under a strict schema, your code never has to parse the model's
 * free-text response. The Python sibling at ../../python/tool_use.py rolls
 * the dispatcher by hand; here the SDK owns it.
 *
 * Note: ESM only (matches the canonical TypeScript project layout).
 * tsconfig snippet: { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022" }
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, tool } from "ai";
import { z } from "zod";

// ── Mock backends (swap for real APIs in production) ─────────────────────────
//
// Keeping the bodies tiny so the file is the *dispatcher contract*, not a
// weather-service integration. Replace with a real provider when wiring.

const MOCK_WEATHER: Record<string, { temperature: number; condition: string }> = {
  tokyo: { temperature: 22, condition: "partly cloudy" },
  berlin: { temperature: 18, condition: "clear" },
  "san francisco": { temperature: 15, condition: "fog" },
};

function lookupWeather(city: string): { city: string; temperature: number; condition: string } | { city: string; error: string } {
  const hit = MOCK_WEATHER[city.toLowerCase()];
  return hit
    ? { city, temperature: hit.temperature, condition: hit.condition }
    : { city, error: "unknown city" };
}

function safeEvaluate(expression: string): { value: number } | { error: string } {
  // Allow only digits, whitespace, and the four basic operators + parens.
  // Anything else returns an error so the model can recover instead of the
  // tool throwing into the agent loop.
  if (!/^[\d\s+\-*/().]+$/.test(expression)) {
    return { error: "expression contains disallowed characters" };
  }
  try {
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${expression});`)() as number;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { error: "expression did not evaluate to a finite number" };
    }
    return { value };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Tool surface ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You are a helpful assistant with access to real-time tools. Call a tool " +
  "exactly when you need its result; otherwise answer directly. After a tool " +
  "result arrives, summarize it for the user in one sentence.";

const tools = {
  get_weather: tool({
    description: "Get current weather for a city. Returns temperature in Celsius and a short condition phrase.",
    parameters: z.object({
      city: z.string().min(1).describe("City name, e.g. 'Tokyo' or 'San Francisco'."),
    }),
    execute: async ({ city }: { city: string }) => lookupWeather(city),
  }),
  calculate: tool({
    description: "Evaluate a mathematical expression. Only +, -, *, /, parentheses, and numbers are allowed.",
    parameters: z.object({
      expression: z.string().min(1).describe("A pure-arithmetic expression, e.g. '12 * (3 + 4)'."),
    }),
    execute: async ({ expression }: { expression: string }) => safeEvaluate(expression),
  }),
};

// ── Smoke runner ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the real dispatcher.");
    return;
  }

  const result = await generateText({
    model: anthropic("claude-haiku-4-5"),
    system: SYSTEM_PROMPT,
    tools,
    maxSteps: 5,
    prompt: "What's the weather in Tokyo right now, and what is 12 * 7?",
  });

  console.log(`answer: ${result.text}`);
  console.log(`steps:  ${result.steps.length}`);
  for (const [i, step] of result.steps.entries()) {
    const calls = step.toolCalls.map((c) => `${c.toolName}(${JSON.stringify(c.args)})`).join(", ") || "(none)";
    console.log(`  step ${i + 1}: tools=${calls}`);
  }
}

// ESM entry-point check.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { tools, lookupWeather, safeEvaluate };
