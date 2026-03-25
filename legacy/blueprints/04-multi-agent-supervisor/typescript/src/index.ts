/**
 * Entry point for Blueprint 04: Multi-Agent Supervisor.
 *
 * Demonstrates the supervisor routing three different task types to the
 * appropriate specialised worker agents and synthesising a final response.
 *
 * Usage:
 *   pnpm dev
 */

import { config } from "dotenv";
config(); // Load .env before anything else

import { SupervisorAgent } from "./supervisor.js";

// ---------------------------------------------------------------------------
// Demo tasks
// ---------------------------------------------------------------------------

interface DemoTask {
  label: string;
  task: string;
}

const DEMO_TASKS: DemoTask[] = [
  {
    label: "research",
    task:
      "What are the three most impactful recent breakthroughs in large language " +
      "model research? Give me a concise bullet-point summary.",
  },
  {
    label: "code",
    task:
      "Write a TypeScript function that implements binary search on a sorted " +
      "number array. Include JSDoc comments and an example usage.",
  },
  {
    label: "multi-domain",
    task:
      "Research the main advantages of async programming in Python, then write " +
      "a short technical blog post (around 300 words) that explains those " +
      "advantages with a concrete asyncio code example.",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function separator(title: string, width = 72): void {
  console.log(`\n${"=".repeat(width)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(width)}\n`);
}

function wrap(text: string, width = 72): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    if ((line + word).length > width) {
      lines.push(line.trimEnd());
      line = "";
    }
    line += `${word} `;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ERROR: ANTHROPIC_API_KEY is not set. " +
        "Copy .env.example to .env and add your key.",
    );
    process.exit(1);
  }

  const supervisor = new SupervisorAgent();
  separator("Blueprint 04 — Multi-Agent Supervisor Demo");

  for (const { label, task } of DEMO_TASKS) {
    separator(`Task [${label}]`);
    console.log(`TASK:\n${wrap(task)}\n`);

    try {
      const result = await supervisor.run(task);
      console.log("RESULT:");
      console.log(result);
    } catch (err) {
      console.error(
        `Task '${label}' failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  separator("Demo complete");
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
