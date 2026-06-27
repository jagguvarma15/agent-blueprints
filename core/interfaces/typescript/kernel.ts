/**
 * Kernel execution contracts — Step, Engine, Control Policy.
 *
 * Mirrors `core/interfaces/python/kernel.py`. Workflows and agents are the same
 * machine; the Control Policy (who picks the next Step) is the only difference.
 */

import type { Ports } from "./ports";
import type { RunState } from "./state";

/** The closed set of Step kinds the IR and the emitters understand. */
export type StepKind =
  | "llm"
  | "tool"
  | "retrieval"
  | "router"
  | "reducer"
  | "subgraph"
  | "human"
  | "compensation"
  | "eval"
  | "code";

/** The four control policies — the workflow <-> agent dial. */
export type PolicyKind = "static_graph" | "router" | "planner" | "hybrid";

/** Read-mostly services handed to every Step. `emit` is the streaming/trace sink. */
export interface StepContext {
  runId: string;
  ports: Ports;
  emit?: (event: unknown) => void;
}

/** What a Step returns: a state delta plus trace metadata. */
export interface StepResult {
  patch: Record<string, unknown>;
  status?: "succeeded" | "failed";
  error?: string;
}

/**
 * One unit of work. Everything is a Step. A Step is a pure function of
 * (state, context); all non-determinism arrives via context and is recorded into
 * Run-State so a recorded run replays exactly.
 */
export interface Step {
  id: string;
  kind: StepKind;
  run(state: RunState, context: StepContext): Promise<StepResult> | StepResult;
}

/** Decides the next Step — the workflow (code) vs agent (model) switch. */
export interface ControlPolicy {
  kind: PolicyKind;
  /** Returns the next Step id, or null to terminate. */
  nextStep(state: RunState): string | null;
}

/** Runs a graph of Steps: next-step resolution, retries, trace, checkpoint, resume. */
export interface Engine {
  run(state: RunState): Promise<RunState> | RunState;
  resume(runId: string): Promise<RunState> | RunState;
}
