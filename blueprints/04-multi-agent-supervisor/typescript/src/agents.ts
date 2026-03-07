/**
 * Worker agent implementations for Blueprint 04: Multi-Agent Supervisor.
 *
 * Each agent is a self-contained Anthropic API client with a domain-specific
 * system prompt. Agents are stateless — every call to `run()` starts a fresh
 * conversation — which keeps them simple and easy to test in isolation.
 */

import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Types / interfaces
// ---------------------------------------------------------------------------

/**
 * Interface that all worker agents must implement.
 *
 * The `name` and `description` fields are read by the supervisor to construct
 * Anthropic tool schemas, so they must be stable string literals.
 */
export interface WorkerAgent {
  /** Unique snake_case identifier used as the Anthropic tool name. */
  readonly name: string;
  /**
   * Human-readable description shown to the supervisor LLM so it can decide
   * when to route a task to this agent. Be specific and concrete.
   */
  readonly description: string;
  /**
   * Execute the task and return the result as a string.
   *
   * @param task - Natural language description of what the agent should do.
   * @returns The agent's response (may contain Markdown).
   */
  run(task: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// BaseAgent
// ---------------------------------------------------------------------------

/**
 * Abstract base class providing shared Anthropic client configuration and a
 * retry-aware `callApi` helper.
 */
abstract class BaseAgent implements WorkerAgent {
  abstract readonly name: string;
  abstract readonly description: string;

  protected readonly client: Anthropic;
  protected readonly model: string;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
  }

  abstract run(task: string): Promise<string>;

  /**
   * Make a single-turn API call with exponential-backoff retry logic.
   *
   * @param system - System prompt that configures the agent's behaviour.
   * @param userMessage - The user-turn message (the task).
   * @param maxRetries - Number of retry attempts on transient errors.
   * @returns The model's text response.
   */
  protected async callApi(
    system: string,
    userMessage: string,
    maxRetries = 3,
  ): Promise<string> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 2048,
          system,
          messages: [{ role: "user", content: userMessage }],
        });

        const textBlock = response.content.find((b) => b.type === "text");
        return textBlock && textBlock.type === "text" ? textBlock.text : "";
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          const delayMs = Math.min(2 ** attempt * 1000, 10_000);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError ?? new Error(`${this.name}: API call failed after ${maxRetries} attempts.`);
  }
}

// ---------------------------------------------------------------------------
// ResearchAgent
// ---------------------------------------------------------------------------

const RESEARCH_SYSTEM = `\
You are an expert research assistant. Your job is to gather information, \
find facts, and produce clear, well-organised research summaries.

Guidelines:
- Be thorough and accurate. Cite hypothetical sources where relevant \
  (e.g. "According to [Nature, 2024]...").
- Prefer bullet points and short paragraphs for scannability.
- When you are uncertain, say so explicitly.
- Do not fabricate statistics; qualify estimates with "approximately" or "roughly".
- Aim for depth over breadth — a focused, accurate answer beats a superficial overview.`;

/**
 * Gathers information, finds facts, and summarises research on any topic.
 */
export class ResearchAgent extends BaseAgent {
  readonly name = "research_agent";
  readonly description =
    "Gathers information, finds facts, and summarises research on any topic. " +
    "Use this agent when you need background information, data, or an overview " +
    "of a subject before writing or coding.";

  async run(task: string): Promise<string> {
    return this.callApi(RESEARCH_SYSTEM, task);
  }
}

// ---------------------------------------------------------------------------
// CodeAgent
// ---------------------------------------------------------------------------

const CODE_SYSTEM = `\
You are an expert software engineer. Your job is to write, explain, and debug \
code across any programming language.

Guidelines:
- Write clean, idiomatic, well-commented code.
- Always wrap code in fenced code blocks with the language tag, e.g. \`\`\`python.
- After the code block, include a short explanation of how it works and any \
  important edge cases.
- Prefer clarity over cleverness; choose readable variable names.
- If a task is ambiguous, state your assumptions before the code.
- Include type hints in Python and TypeScript code.`;

/**
 * Writes, explains, and debugs code in any programming language.
 */
export class CodeAgent extends BaseAgent {
  readonly name = "code_agent";
  readonly description =
    "Writes, explains, and debugs code in any programming language. " +
    "Use this agent when the task involves implementing a function, algorithm, " +
    "script, or when you need a code example to accompany written content.";

  async run(task: string): Promise<string> {
    return this.callApi(CODE_SYSTEM, task);
  }
}

// ---------------------------------------------------------------------------
// WritingAgent
// ---------------------------------------------------------------------------

const WRITING_SYSTEM = `\
You are an expert writer and editor. Your job is to draft, refine, and \
structure text across formats: blog posts, reports, summaries, emails, \
documentation, and more.

Guidelines:
- Adapt your tone and style to the requested format (technical, casual, formal, etc.).
- Use clear headings (Markdown ## / ###) to structure longer pieces.
- Keep sentences concise. Prefer active voice.
- Integrate any provided research or code naturally into the prose — do not \
  just paste them verbatim.
- Proofread for grammar and clarity before responding.`;

/**
 * Drafts, edits, and structures text in any format or tone.
 */
export class WritingAgent extends BaseAgent {
  readonly name = "writing_agent";
  readonly description =
    "Drafts, edits, and structures text in any format or tone — blog posts, " +
    "reports, summaries, emails, and documentation. Use this agent when the " +
    "task involves producing or polishing written content.";

  async run(task: string): Promise<string> {
    return this.callApi(WRITING_SYSTEM, task);
  }
}

// ---------------------------------------------------------------------------
// Agent Registry
// ---------------------------------------------------------------------------

/**
 * Global registry mapping agent names to their instances.
 * The supervisor loads this at startup to derive tool schemas.
 */
export const AGENT_REGISTRY: Map<string, WorkerAgent> = new Map([
  ["research_agent", new ResearchAgent()],
  ["code_agent", new CodeAgent()],
  ["writing_agent", new WritingAgent()],
]);
