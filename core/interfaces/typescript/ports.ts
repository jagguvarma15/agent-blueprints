/**
 * Kernel Ports — the seams where the agent core meets the outside world.
 *
 * Mirrors `core/interfaces/python/ports.py`. Interfaces here; concrete adapters
 * live in agent-deployments and bind to a port by selection.
 */

import type { Message } from "./state";

/** The LLM. Generates a completion from messages, optionally tool-aware. */
export interface ModelPort {
  generate(messages: Message[], tools?: object[]): Promise<string> | string;
}

/** The tool surface — native functions or an MCP server. Model-controlled. */
export interface ToolRegistryPort {
  schemas(): object[];
  invoke(name: string, args: Record<string, unknown>): Promise<string> | string;
}

/** Durable storage + retrieval. NOT working memory, NOT context assembly. */
export interface MemoryPort {
  write(key: string, value: unknown): Promise<void> | void;
  search(query: string, k?: number): Promise<object[]> | object[];
}

/**
 * How much execution durability the runtime guarantees. These are not
 * interchangeable: only "durable" gives exactly-once recovery across crashes.
 */
export type DurabilityTier = "none" | "checkpoint" | "durable";

/** Where the Engine runs and how it persists Run-State. */
export interface RuntimePort {
  tier: DurabilityTier;
  save(runId: string, state: unknown): Promise<void> | void;
  load(runId: string): Promise<unknown | null> | unknown | null;
}

/** Delegate a task to another agent (in-process sub-graph or remote A2A). */
export interface AgentPort {
  delegate(agent: string, task: string): Promise<string> | string;
}

/** The bundle of bound port adapters handed to every Step via the context. */
export interface Ports {
  model: ModelPort;
  tools?: ToolRegistryPort;
  memory?: MemoryPort;
  runtime?: RuntimePort;
  agents?: AgentPort;
}
