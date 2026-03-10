import "dotenv/config";
import { PlanExecuteAgent } from "./agent.js";
import { TOOL_DEFINITIONS, buildToolRegistry } from "./tools.js";

function ensureApiKey(): void {
  if (!process.env["ANTHROPIC_API_KEY"]) {
    console.error(
      "Error: ANTHROPIC_API_KEY environment variable not set.\n" +
        "Copy .env.example to .env and add your API key."
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  ensureApiKey();

  const model = process.env["MODEL"] ?? "claude-opus-4-6";
  const agent = new PlanExecuteAgent({ model, tools: TOOL_DEFINITIONS });
  agent.setToolRegistry(buildToolRegistry());

  const query =
    "Research the top three causes of latency in LLM applications and provide " +
    "a practical optimization checklist.";

  console.log("Plan-and-Execute Agent Blueprint (TypeScript)");
  console.log(`Model: ${model}`);
  console.log("-".repeat(70));
  console.log(`Query: ${query}\n`);

  const answer = await agent.run(query);
  console.log("Final answer:\n");
  console.log(answer);
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
