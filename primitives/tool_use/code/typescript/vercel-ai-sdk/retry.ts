/**
 * Compact-Error Retry — bounded retry that feeds a compacted error back.
 *
 * Pattern: Tool Use (the recovery wrapper around a single tool dispatch).
 * Framework-agnostic: pure TypeScript, no SDK dependency — wrap any execute()
 *   the dispatcher in tool-use.ts calls. Mirrors the Python sibling
 *   ../../python/retry.py.
 * Idioms: on failure, compact the error to a short model-readable line and
 *   retry up to a fixed budget; then return a ToolResult carrying the compacted
 *   error so the agent self-corrects or reports cleanly instead of crashing.
 *   Bounded by design — maxAttempts caps the loop so a failing tool can't spin.
 * Design doc: ../../../design.md
 *
 * Run:  npx tsx retry.ts   (zero runtime deps — nothing to install)
 *
 * Note: ESM only (matches the canonical TypeScript project layout).
 * tsconfig snippet: { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022" }
 */

// ── Core types ────────────────────────────────────────────────────────────────

const MAX_ERROR_CHARS = 280;

/** One tool invocation request from the model. Mirrors schemas/state.py. */
interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  id?: string;
}

/** The outcome of executing a ToolCall. Mirrors schemas/state.py. */
interface ToolResult {
  tool: string;
  output: string;
  error?: string;
  id?: string;
}

/** Outcome of a guarded tool execution. */
interface RetryReport {
  result: ToolResult;
  attempts: number;
  errors: string[];
}

/**
 * Reduce a thrown value to a short, model-readable one-liner.
 *
 * Keeps the type and message, collapses newlines, and truncates — enough for
 * the model to adjust its next call without flooding the context window.
 */
function compactError(err: unknown): string {
  const name = err instanceof Error ? err.constructor.name : typeof err;
  const message = err instanceof Error ? err.message : String(err);
  let summary = `${name}: ${message}`.replace(/\n/g, " ").trim();
  if (summary.length > MAX_ERROR_CHARS) {
    summary = summary.slice(0, MAX_ERROR_CHARS - 1) + "…";
  }
  return summary;
}

// ── Implementation ─────────────────────────────────────────────────────────────

/**
 * Run `execute(call)`, retrying on a thrown error with a compacted summary.
 *
 * On success the returned {@link ToolResult} carries the tool output; after
 * `maxAttempts` failures it carries the last compacted error (with
 * `ToolResult.error` set), so the caller injects a clean failure into the
 * conversation instead of throwing.
 *
 * `execute` may be sync or async — both are awaited, matching the async tool
 * dispatch in tool-use.ts.
 */
async function runWithRetry(
  call: ToolCall,
  execute: (call: ToolCall) => Promise<string> | string,
  opts: { maxAttempts?: number } = {},
): Promise<RetryReport> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const errors: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const output = await execute(call);
      return { result: { tool: call.tool, output, id: call.id }, attempts: attempt, errors };
    } catch (err) {
      errors.push(compactError(err));
    }
  }
  const lastError = errors.length > 0 ? errors[errors.length - 1] : "unknown error";
  return {
    result: { tool: call.tool, output: lastError, error: lastError, id: call.id },
    attempts: maxAttempts,
    errors,
  };
}

// ── Example ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let seen = 0;
  const flaky = (): string => {
    seen += 1;
    if (seen < 2) {
      throw new Error("upstream 503\nretry later");
    }
    return "ok: fetched 3 rows";
  };
  const recovered = await runWithRetry({ tool: "fetch", args: {} }, flaky, { maxAttempts: 3 });
  console.log(`recovered: attempts=${recovered.attempts} output='${recovered.result.output}'`);

  const broken = (): string => {
    throw new Error("bad input");
  };
  const failed = await runWithRetry({ tool: "broken", args: {} }, broken, { maxAttempts: 2 });
  console.log(`failed: attempts=${failed.attempts} error='${failed.result.error}'`);
}

// ESM entry-point check.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { compactError, runWithRetry, MAX_ERROR_CHARS };
export type { ToolCall, ToolResult, RetryReport };
