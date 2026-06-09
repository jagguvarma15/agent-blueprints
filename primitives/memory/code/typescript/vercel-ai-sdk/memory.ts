/**
 * Memory Agent — Vercel AI SDK variant.
 *
 * Pattern: Memory (working buffer for the current conversation + long-term
 *   key/value store that persists across sessions; an extract-and-store
 *   pass after each turn writes new facts).
 * Framework: Vercel AI SDK (ai ^4.0.0) + @ai-sdk/anthropic (^1.0.0).
 * Idioms: generateText() with an inlined memory recall in the system prompt
 *   for the answer turn; generateObject() with a permissive z.record schema
 *   for the extract-and-store turn so the model returns typed key/value
 *   facts instead of free-text JSON the caller would have to parse.
 * Design doc: ../../../design.md (the framework-agnostic
 *   ../../python/memory_agent.py runs the same two-turn smoke: the user
 *   shares context, then asks a question and the recalled facts shape the
 *   answer).
 *
 * Install:  pnpm add ai @ai-sdk/anthropic zod
 *           (or via tsx-on-demand: npx tsx memory.ts)
 * Run:      ANTHROPIC_API_KEY=... npx tsx memory.ts
 *
 * Note: ESM only.
 * tsconfig snippet: { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022" }
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, generateText } from "ai";
import { z } from "zod";

// ── Working memory ──────────────────────────────────────────────────────────

interface Turn {
  role: "system" | "user" | "assistant";
  content: string;
}

class WorkingMemory {
  private history: Turn[] = [];

  constructor(private readonly maxTurns = 20) {}

  add(role: Turn["role"], content: string): void {
    this.history.push({ role, content });
    if (this.history.length > this.maxTurns * 2) {
      const system = this.history.filter((m) => m.role === "system");
      const rest = this.history.filter((m) => m.role !== "system");
      this.history = [...system, ...rest.slice(-this.maxTurns * 2)];
    }
  }

  get(): Turn[] {
    return [...this.history];
  }
}

// ── Long-term store ────────────────────────────────────────────────────────

class LongTermStore {
  private store = new Map<string, string>();

  set(key: string, value: string): void {
    this.store.set(key, value);
  }

  get(key: string): string | undefined {
    return this.store.get(key);
  }

  search(query: string): Record<string, string> {
    const q = query.toLowerCase();
    const out: Record<string, string> = {};
    for (const [k, v] of this.store) {
      if (k.toLowerCase().includes(q) || v.toLowerCase().includes(q)) out[k] = v;
    }
    return out;
  }

  all(): Record<string, string> {
    return Object.fromEntries(this.store);
  }
}

// ── Memory agent ────────────────────────────────────────────────────────────

const FactSet = z.record(z.string());

class MemoryAgent {
  private readonly working: WorkingMemory;
  private readonly longTerm = new LongTermStore();

  constructor(
    system: string,
    private readonly model = anthropic("claude-haiku-4-5"),
    maxTurns = 20,
  ) {
    this.working = new WorkingMemory(maxTurns);
    this.working.add("system", system);
  }

  async chat(userMessage: string): Promise<string> {
    // Recall: substring search over the long-term store. Real systems swap
    // this for a vector recall (Qdrant, Pinecone) on `userMessage`.
    const recalled = this.longTerm.search(userMessage);
    const recallBlock = Object.keys(recalled).length
      ? `Relevant memory:\n${Object.entries(recalled).map(([k, v]) => `  ${k}: ${v}`).join("\n")}\n\n---\n\n`
      : "";

    const augmented = `${recallBlock}User: ${userMessage}`;
    this.working.add("user", augmented);

    const result = await generateText({
      model: this.model,
      messages: this.working.get(),
    });
    const response = result.text;
    this.working.add("assistant", response);

    // Extract-and-store turn: never throws into the chat path.
    await this.extractAndStore(userMessage, response).catch(() => undefined);
    return response;
  }

  private async extractAndStore(userMessage: string, assistantResponse: string): Promise<void> {
    const extracted = await generateObject({
      model: this.model,
      schema: FactSet,
      system: "Extract durable facts about the user as a key/value JSON object. Return {} when nothing is worth remembering.",
      prompt: `User: ${userMessage}\nAssistant: ${assistantResponse}\n\nReturn only the JSON object.`,
    });
    for (const [k, v] of Object.entries(extracted.object)) {
      this.longTerm.set(k, v);
    }
  }

  memorySnapshot(): Record<string, string> {
    return this.longTerm.all();
  }
}

// ── Smoke runner ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the chat + extract path.");
    return;
  }

  const agent = new MemoryAgent(
    "You are a helpful coding assistant that remembers user preferences.",
  );

  const r1 = await agent.chat("I mostly work in Python and I'm building an agent system.");
  console.log(`Turn 1: ${r1}`);
  console.log(`Memory: ${JSON.stringify(agent.memorySnapshot())}`);

  const r2 = await agent.chat("What's the best way to handle errors in my project?");
  console.log(`\nTurn 2: ${r2}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { MemoryAgent, WorkingMemory, LongTermStore };
export type { Turn };
