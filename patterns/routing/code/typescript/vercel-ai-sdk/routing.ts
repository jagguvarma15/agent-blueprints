/**
 * Routing — Vercel AI SDK variant.
 *
 * Pattern: Routing (classifier picks one specialist route, then the route's
 *   own LLM call answers under a role-specific system prompt).
 * Framework: Vercel AI SDK (ai ^4.0.0) + @ai-sdk/anthropic (^1.0.0).
 * Idioms: generateObject() with a Zod-typed RouteDecision schema owns the
 *   classification step; a second generateText() per route owns the answer.
 *   No tools / no agent loop — routing is two sequential model calls.
 * Design doc: ../../../design.md (the framework-agnostic ../../python/routing.py
 *   runs the same 3 routes — billing, technical, general — against the same
 *   3 seed messages).
 *
 * Install:  pnpm add ai @ai-sdk/anthropic zod
 *           (or via tsx-on-demand: npx tsx routing.ts)
 * Run:      ANTHROPIC_API_KEY=... npx tsx routing.ts
 *
 * Note: ESM only.
 * tsconfig snippet: { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022" }
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, generateText } from "ai";
import { z } from "zod";

// ── Types ────────────────────────────────────────────────────────────────────

interface Route {
  name: string;
  description: string;
  systemPrompt: string;
}

interface RoutingResult {
  routeName: string;
  confidence: number;
  reason: string;
  response: string;
  fallbackUsed: boolean;
}

// ── Routes (mirrors the python sibling) ─────────────────────────────────────

const ROUTES: Route[] = [
  {
    name: "billing",
    description: "Questions about invoices, payments, subscriptions, and pricing",
    systemPrompt: "You are a billing support specialist. Be precise about payment details.",
  },
  {
    name: "technical",
    description: "Bug reports, error messages, API issues, and technical troubleshooting",
    systemPrompt: "You are a technical support engineer. Ask for logs and reproduction steps.",
  },
  {
    name: "general",
    description: "General questions, product info, and anything else",
    systemPrompt: "You are a general support agent. Be helpful and friendly.",
  },
];

const FALLBACK_ROUTE = "general";
const CONFIDENCE_THRESHOLD = 0.5;

// ── Classifier ──────────────────────────────────────────────────────────────

function classifierSystemPrompt(routes: Route[]): string {
  const catalog = routes.map((r) => `- ${r.name}: ${r.description}`).join("\n");
  return (
    "You classify incoming support messages into exactly one of these routes. " +
    "Return the route name, your confidence (0..1), and a short reason.\n\n" +
    `Routes:\n${catalog}`
  );
}

const RouteDecision = z.object({
  route: z.string().describe("One of the listed route names, lower-case."),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
});

// ── Router ──────────────────────────────────────────────────────────────────

class Router {
  private byName: Map<string, Route>;

  constructor(
    private readonly routes: Route[] = ROUTES,
    private readonly model = anthropic("claude-haiku-4-5"),
    private readonly confidenceThreshold = CONFIDENCE_THRESHOLD,
    private readonly fallback = FALLBACK_ROUTE,
  ) {
    this.byName = new Map(routes.map((r) => [r.name, r]));
  }

  async route(message: string): Promise<RoutingResult> {
    const decision = await generateObject({
      model: this.model,
      schema: RouteDecision,
      system: classifierSystemPrompt(this.routes),
      prompt: message,
    });

    const picked = this.byName.get(decision.object.route);
    const fallbackUsed = !picked || decision.object.confidence < this.confidenceThreshold;
    const chosen = fallbackUsed ? this.byName.get(this.fallback)! : picked!;

    const answer = await generateText({
      model: this.model,
      system: chosen.systemPrompt,
      prompt: message,
    });

    return {
      routeName: chosen.name,
      confidence: decision.object.confidence,
      reason: decision.object.reason,
      response: answer.text,
      fallbackUsed,
    };
  }
}

// ── Smoke runner ────────────────────────────────────────────────────────────

const SEED_MESSAGES = [
  "I was charged twice on my invoice this month",
  "Getting a 500 error when calling the API",
  "What are your business hours?",
];

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Skipping smoke run — set ANTHROPIC_API_KEY to exercise both model calls.");
    return;
  }

  const router = new Router();
  for (const message of SEED_MESSAGES) {
    const result = await router.route(message);
    const flag = result.fallbackUsed ? " (fallback)" : "";
    console.log(
      `[${result.routeName}]${flag} (conf=${result.confidence.toFixed(2)}) ${result.response.slice(0, 60)}`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { Router, ROUTES, RouteDecision };
export type { Route, RoutingResult };
