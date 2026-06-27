/**
 * Framework-agnostic reference contracts for the agent kernel (TypeScript).
 *
 * Mirror of `core/interfaces/python`. Reference interfaces only — concrete
 * implementations live in agent-deployments; the IR (`core/spec/ir.schema.json`)
 * is what a selection compiles to.
 */

export * from "./state";
export * from "./ports";
export * from "./kernel";
