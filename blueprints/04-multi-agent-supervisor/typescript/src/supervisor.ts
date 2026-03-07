/**
 * SupervisorAgent for Blueprint 04: Multi-Agent Supervisor.
 *
 * The supervisor maintains a registry of worker agents, uses the Anthropic API
 * with tool-calling to decide which agents to invoke, dispatches tasks to those
 * agents (running same-round calls in parallel), collects results, and
 * synthesises a final answer.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Tool, MessageParam, ContentBlock, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages.js";
import { AGENT_REGISTRY, type WorkerAgent } from "./agents.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MAX_ITERATIONS = 10;

const SUPERVISOR_SYSTEM = `\
You are a supervisor agent responsible for completing complex tasks by \
delegating work to specialised worker agents.

Your workflow:
1. Analyse the user's task and identify what types of expertise are needed.
2. Call the appropriate worker agent(s) with well-scoped subtasks.
3. Review each agent's output. If a result is insufficient, you may call that \
   agent again with a more precise request.
4. Once you have everything you need, synthesise a single, cohesive final \
   response that directly addresses the user's original request.

Important rules:
- Always delegate to the most appropriate agent for each subtask.
- You can call multiple agents in sequence — or the same agent more than once.
- Do NOT attempt to do research, write production code, or draft prose yourself; \
  always delegate those tasks to the relevant worker.
- Your final response (when you stop calling tools) should be complete and \
  polished — the user should not need to read the intermediate agent outputs.`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SupervisorOptions {
  /** Custom agent registry. Defaults to the global AGENT_REGISTRY. */
  agents?: Map<string, WorkerAgent>;
  /** Anthropic model identifier. Defaults to ANTHROPIC_MODEL env var or claude-sonnet-4-5. */
  model?: string;
  /** Maximum tokens for each supervisor API call. */
  maxTokens?: number;
  /** Hard limit on the number of dispatch rounds to prevent infinite loops. */
  maxIterations?: number;
}

// ---------------------------------------------------------------------------
// SupervisorAgent
// ---------------------------------------------------------------------------

/**
 * Central orchestrator that routes tasks to specialised worker agents.
 *
 * @example
 * ```ts
 * const supervisor = new SupervisorAgent();
 * const result = await supervisor.run(
 *   "Research the top Python web frameworks and write a comparison blog post."
 * );
 * console.log(result);
 * ```
 */
export class SupervisorAgent {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly maxIterations: number;
  private readonly agents: Map<string, WorkerAgent>;
  private tools: Tool[];

  constructor(options: SupervisorOptions = {}) {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.agents = options.agents ?? AGENT_REGISTRY;
    this.tools = this.buildTools();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Run the supervisor on the given task and return the final answer.
   *
   * @param task - The user's natural language request.
   * @returns A synthesised response that integrates the outputs of all worker
   *   agents that were invoked.
   * @throws {Error} If the maximum number of iterations is exceeded without a
   *   final text response.
   */
  async run(task: string): Promise<string> {
    console.info(`[Supervisor] Starting task: ${task.slice(0, 100)}…`);

    const messages: MessageParam[] = [{ role: "user", content: task }];

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      console.debug(`[Supervisor] Iteration ${iteration}`);

      const response = await this.callSupervisor(messages);

      // Check for final text response (no tool calls)
      if (response.stop_reason === "end_turn") {
        const finalText = this.extractText(response.content);
        if (finalText) {
          console.info(`[Supervisor] Finished after ${iteration} iteration(s).`);
          return finalText;
        }
      }

      // Collect tool_use blocks
      const toolUseBlocks = response.content.filter(
        (b): b is ToolUseBlock => b.type === "tool_use",
      );

      if (toolUseBlocks.length === 0) {
        // No tool calls and no final text — should not happen, but handle gracefully
        const text = this.extractText(response.content);
        if (text) return text;
        throw new Error(
          `Supervisor produced no tool calls and no text on iteration ${iteration}.`,
        );
      }

      // Append the assistant turn (may contain text + tool_use blocks)
      messages.push({ role: "assistant", content: response.content });

      // Dispatch all tool calls in this round in parallel
      const toolResults = await this.dispatchToolCalls(toolUseBlocks);

      // Append results as a user turn
      messages.push({ role: "user", content: toolResults });
    }

    throw new Error(
      `Supervisor reached the maximum of ${this.maxIterations} iterations ` +
        "without producing a final answer. Increase MAX_SUPERVISOR_ITERATIONS " +
        "or simplify the task.",
    );
  }

  /**
   * Add a new worker agent to the registry at runtime.
   *
   * @param agent - The agent to register. Its `name` is used as the tool name.
   */
  registerAgent(agent: WorkerAgent): void {
    this.agents.set(agent.name, agent);
    this.tools = this.buildTools(); // rebuild tool schemas
    console.info(`[Supervisor] Registered new agent: ${agent.name}`);
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Derive Anthropic tool schemas from the agent registry. */
  private buildTools(): Tool[] {
    return Array.from(this.agents.values()).map((agent) => ({
      name: agent.name,
      description: agent.description,
      input_schema: {
        type: "object" as const,
        properties: {
          task: {
            type: "string",
            description:
              "The specific subtask for this agent to complete. " +
              "Be precise and self-contained — the agent has no access to the " +
              "broader conversation.",
          },
        },
        required: ["task"],
      },
    }));
  }

  /** Call the Anthropic API for the supervisor with exponential-backoff retries. */
  private async callSupervisor(
    messages: MessageParam[],
    maxRetries = 3,
  ): Promise<Anthropic.Message> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.client.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          system: SUPERVISOR_SYSTEM,
          tools: this.tools,
          messages,
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          const delayMs = Math.min(2 ** attempt * 1000, 10_000);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError ?? new Error("Supervisor API call failed after retries.");
  }

  /**
   * Dispatch a batch of tool_use blocks to the corresponding agents in parallel.
   *
   * @param toolUseBlocks - ToolUseBlock items from the supervisor response.
   * @returns An array of tool_result content objects for the next user turn.
   */
  private async dispatchToolCalls(
    toolUseBlocks: ToolUseBlock[],
  ): Promise<Anthropic.ToolResultBlockParam[]> {
    const settled = await Promise.allSettled(
      toolUseBlocks.map((block) => this.invokeAgent(block)),
    );

    return toolUseBlocks.map((block, i) => {
      const outcome = settled[i];
      const content =
        outcome.status === "fulfilled"
          ? outcome.value
          : `Error: ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`;

      if (outcome.status === "rejected") {
        console.error(
          `[Supervisor] Agent ${block.name} raised an error: ${content}`,
        );
      }

      return {
        type: "tool_result" as const,
        tool_use_id: block.id,
        content,
      };
    });
  }

  /**
   * Look up and invoke the worker agent for a single tool_use block.
   *
   * @param block - A tool_use content block from the supervisor response.
   * @returns The agent's string output.
   * @throws {Error} If no agent is registered under `block.name`.
   */
  private async invokeAgent(block: ToolUseBlock): Promise<string> {
    const agentName = block.name;
    const input = block.input as Record<string, unknown>;
    const task = typeof input["task"] === "string" ? input["task"] : "";

    const agent = this.agents.get(agentName);
    if (!agent) {
      const known = Array.from(this.agents.keys()).join(", ");
      throw new Error(
        `No agent registered as '${agentName}'. Known agents: ${known}.`,
      );
    }

    console.info(`[Supervisor] Dispatching to ${agentName}: ${task.slice(0, 80)}…`);
    const result = await agent.run(task);
    console.info(`[Supervisor] ${agentName} returned ${result.length} characters.`);
    return result;
  }

  /** Extract and join all text blocks from a content array. */
  private extractText(content: ContentBlock[]): string {
    return content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n\n");
  }
}
