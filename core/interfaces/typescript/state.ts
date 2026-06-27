/**
 * Kernel Run-State base — the single serializable object threaded through every Step.
 *
 * Mirrors `core/interfaces/python/state.py`. Run-State IS the agent's working
 * memory; durable memory lives behind a MemoryPort and context assembly is a
 * cross-cutting concern (see ../../design.md — the memory three-way split).
 */

export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "compensated";

export interface Message {
  /** "system" | "user" | "assistant" | "tool". */
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Tool name when role === "tool". */
  name?: string;
}

/** One recorded Step execution — the unit of the determinism / replay log. */
export interface TraceEntry {
  stepId: string;
  status: StepStatus;
  /** Key into RunState.outputs holding this step's recorded result. */
  outputKey?: string;
  error?: string;
}

/** The resource envelope the cross-cutting budget guard enforces. */
export interface Budget {
  maxSteps: number;
  maxTokens?: number;
  maxCostUsd?: number;
  spentSteps: number;
  spentTokens: number;
  spentCostUsd: number;
}

/** Base Run-State. Domain patterns extend this with their own fields. */
export interface RunState {
  runId: string;
  goal: string;
  messages: Message[];
  trace: TraceEntry[];
  /** Recorded Step outputs keyed by Step id — the replay log. */
  outputs: Record<string, unknown>;
  budget: Budget;
  /** "done" | "budget" | "error" | "interrupted". */
  terminatedReason?: string;
}
