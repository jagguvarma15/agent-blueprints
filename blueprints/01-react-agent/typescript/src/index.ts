/**
 * Entry point for the ReAct Agent blueprint (TypeScript).
 *
 * Demonstrates the ReAct agent with several example queries that showcase:
 *   1. Pure computation (calculator tool)
 *   2. Time-based queries (get_current_time tool)
 *   3. Information retrieval (web_search tool)
 *   4. Multi-step reasoning (combining multiple tools)
 *
 * Usage:
 *   pnpm dev
 *   # or
 *   node --import tsx/esm src/index.ts
 */

import "dotenv/config";
import { ReActAgent } from "./agent.js";
import { TOOL_DEFINITIONS, buildToolRegistry } from "./tools.js";

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function checkApiKey(): string {
  const key = process.env["ANTHROPIC_API_KEY"];
  if (!key) {
    console.error(
      "Error: ANTHROPIC_API_KEY environment variable not set.\n" +
        "Copy .env.example to .env and add your API key."
    );
    process.exit(1);
  }
  return key;
}

async function runExample(
  agent: ReActAgent,
  query: string,
  label: string
): Promise<void> {
  console.log("\n" + "=".repeat(70));
  console.log(`EXAMPLE: ${label}`);
  console.log("=".repeat(70));

  const result = await agent.run(query);

  console.log("\n" + "-".repeat(60));
  console.log("FINAL ANSWER:");
  console.log(result.answer);
  console.log(`\n[Completed in ${result.iterations} iteration(s), success: ${result.success}]`);
  console.log("=".repeat(70));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  checkApiKey();

  const model = process.env["MODEL"] ?? "claude-opus-4-6";
  const maxIterations = parseInt(process.env["MAX_ITERATIONS"] ?? "10", 10);

  console.log("ReAct Agent Blueprint (TypeScript)");
  console.log(`Model: ${model} | Max iterations: ${maxIterations}`);

  const agent = new ReActAgent({
    model,
    tools: TOOL_DEFINITIONS,
    maxIterations,
  });

  // Register all tool implementations
  agent.setToolRegistry(buildToolRegistry());

  // Example 1: Pure math computation
  await runExample(
    agent,
    "What is the square root of the number of seconds in a week?",
    "Math computation"
  );

  // Example 2: Current time query
  await runExample(
    agent,
    "What time is it right now in Tokyo and in New York?",
    "Timezone query"
  );

  // Example 3: Multi-step computation
  await runExample(
    agent,
    "If I invest $10,000 at 7% annual compound interest, " +
      "how much will I have after 20 years? " +
      "Also, what is that as a multiple of the original investment?",
    "Multi-step computation"
  );

  // Example 4: Search + summarize
  await runExample(
    agent,
    "Search for information about the ReAct agent pattern, " +
      "then give me a one-paragraph summary of what it is.",
    "Search and summarize"
  );

  console.log("\nAll examples complete.");
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
