/**
 * ReAct Agent implementation using the Anthropic TypeScript SDK.
 *
 * The ReAct (Reasoning + Acting) pattern interleaves reasoning traces with tool calls:
 *   1. The model reasons about what to do (Think)
 *   2. The model calls a tool (Act)
 *   3. The tool result is added to the conversation (Observe)
 *   4. Steps 1-3 repeat until the model produces a final text answer
 *
 * References:
 *   - ReAct paper: https://arxiv.org/abs/2210.03629
 *   - Anthropic Tool Use: https://docs.anthropic.com/en/docs/tool-use
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ToolRegistry } from "./tools.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for the ReActAgent */
export interface ReActAgentConfig {
  /** Anthropic model ID, e.g. "claude-opus-4-6" */
  model: string;
  /** Tool definitions in Anthropic format */
  tools: Anthropic.Tool[];
  /** Maximum number of think-act-observe cycles before giving up. Default: 10 */
  maxIterations?: number;
  /** System prompt override. Uses DEFAULT_SYSTEM_PROMPT if not provided. */
  systemPrompt?: string;
  /** Anthropic client instance. Creates a new one if not provided. */
  client?: Anthropic;
}

/** A single step in the agent's execution trace */
export interface AgentStep {
  iteration: number;
  type: "thinking" | "tool_call" | "tool_result" | "final_answer";
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}

/** The result of an agent.run() call */
export interface AgentResult {
  answer: string;
  steps: AgentStep[];
  iterations: number;
  success: boolean;
}

// ---------------------------------------------------------------------------
// ReActAgent class
// ---------------------------------------------------------------------------

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant with access to tools. Use the available tools whenever they would help you give a more accurate or complete answer.

When answering:
1. Think about what information or computation you need
2. Use tools to gather that information
3. Reason about the results
4. Provide a clear, concise final answer

Always be transparent about what tools you used and what you found.`;

export class ReActAgent {
  readonly model: string;
  readonly tools: Anthropic.Tool[];
  readonly maxIterations: number;
  readonly systemPrompt: string;

  private readonly client: Anthropic;
  private toolRegistry: ToolRegistry;

  constructor(config: ReActAgentConfig) {
    this.model = config.model;
    this.tools = config.tools;
    this.maxIterations = config.maxIterations ?? 10;
    this.systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.client = config.client ?? new Anthropic();
    this.toolRegistry = new Map();
  }

  /**
   * Set the tool registry — maps tool names to their implementations.
   *
   * @param registry Map from tool name to implementation function
   */
  setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }

  /**
   * Register a single tool implementation.
   *
   * @param name Tool name (must match the name in TOOL_DEFINITIONS)
   * @param fn Implementation function that accepts a record and returns a string
   */
  registerTool(name: string, fn: (input: Record<string, unknown>) => string): void {
    this.toolRegistry.set(name, fn);
  }

  /**
   * Execute the ReAct loop for the given query.
   *
   * The agent repeatedly:
   *   1. Calls the Claude API with current message history
   *   2. If stopReason === "tool_use": executes tools and appends results
   *   3. If stopReason === "end_turn": returns the final text answer
   *
   * @param query The user's question or task
   * @returns AgentResult with the answer, execution steps, and metadata
   */
  async run(query: string): Promise<AgentResult> {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: query }];
    const steps: AgentStep[] = [];

    console.log(`\nUser: ${query}`);
    console.log("-".repeat(60));

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      // --- Think: call the model ---
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: this.systemPrompt,
        tools: this.tools,
        messages,
      });

      // Print and record any text blocks (the reasoning)
      for (const block of response.content) {
        if (block.type === "text" && block.text) {
          console.log(`\nAgent [iteration ${iteration + 1}]: ${block.text}`);
          steps.push({
            iteration: iteration + 1,
            type: "thinking",
            content: block.text,
          });
        }
      }

      // Append the full assistant response to history
      messages.push({ role: "assistant", content: response.content });

      // --- Check if we're done ---
      if (response.stop_reason === "end_turn") {
        const finalText = this.extractText(response.content);
        if (finalText) {
          steps.push({
            iteration: iteration + 1,
            type: "final_answer",
            content: finalText,
          });
          return {
            answer: finalText,
            steps,
            iterations: iteration + 1,
            success: true,
          };
        }
        return {
          answer: "Agent completed but produced no text response.",
          steps,
          iterations: iteration + 1,
          success: false,
        };
      }

      // --- Act: find and execute tool calls ---
      if (response.stop_reason === "tool_use") {
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type !== "tool_use") continue;

          const toolName = block.name;
          const toolInput = block.input as Record<string, unknown>;
          const toolUseId = block.id;

          console.log(
            `\n  [Tool call] ${toolName}(${JSON.stringify(toolInput, null, 2)})`
          );

          steps.push({
            iteration: iteration + 1,
            type: "tool_call",
            content: JSON.stringify(toolInput),
            toolName,
            toolInput,
          });

          // --- Observe: execute the tool ---
          const result = this.callTool(toolName, toolInput);
          const preview = result.length > 200 ? `${result.slice(0, 200)}...` : result;
          console.log(`  [Tool result] ${preview}`);

          steps.push({
            iteration: iteration + 1,
            type: "tool_result",
            content: result,
            toolName,
          });

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUseId,
            content: result,
          });
        }

        // Append tool results as a user message (Anthropic API convention)
        messages.push({ role: "user", content: toolResults });
        continue;
      }

      // Unexpected stop reason
      return {
        answer: `Agent stopped unexpectedly with reason: ${response.stop_reason}`,
        steps,
        iterations: iteration + 1,
        success: false,
      };
    }

    // Exhausted all iterations
    return {
      answer:
        `Max iterations (${this.maxIterations}) reached without a final answer. ` +
        "Try simplifying your query or increasing maxIterations.",
      steps,
      iterations: this.maxIterations,
      success: false,
    };
  }

  /**
   * Dispatch a tool call to the registered tool function.
   *
   * Catches all exceptions so that errors are returned as strings rather than
   * propagating and crashing the agent loop.
   *
   * @param toolName The name of the tool to call
   * @param toolInput Arguments to pass to the tool function
   * @returns The tool's string result, or an error message string
   */
  callTool(toolName: string, toolInput: Record<string, unknown>): string {
    const fn = this.toolRegistry.get(toolName);
    if (!fn) {
      const available = Array.from(this.toolRegistry.keys());
      return `Error: Unknown tool '${toolName}'. Available tools: [${available.join(", ")}]`;
    }

    try {
      const result = fn(toolInput);
      return typeof result === "string" ? result : JSON.stringify(result);
    } catch (err) {
      if (err instanceof TypeError) {
        return `Error: Tool '${toolName}' received invalid arguments: ${err.message}`;
      }
      return `Error: Tool '${toolName}' failed with: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  /**
   * Extract and concatenate all text blocks from a response content array.
   *
   * @param content Array of content blocks from an Anthropic API response
   * @returns Concatenated text from all text blocks, trimmed
   */
  extractText(content: Anthropic.ContentBlock[]): string {
    return content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
  }
}
