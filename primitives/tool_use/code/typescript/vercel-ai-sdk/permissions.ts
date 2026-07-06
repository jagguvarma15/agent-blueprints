/**
 * Tool Permissions — Always / Ask / Never gating for tool execution.
 *
 * Pattern: Tool Use (the permission tier consulted before every dispatch).
 * Framework-agnostic: pure TypeScript, no SDK dependency — it slots under the
 *   Vercel AI SDK dispatcher in tool-use.ts, or any other tool loop. Mirrors the
 *   Python sibling ../../python/permissions.py.
 * Idioms: ALWAYS runs silently, ASK routes to a human-approval callback (the
 *   human-in-the-loop seam), NEVER refuses outright. A tool absent from the map
 *   defaults to ASK — fail safe, never silently run.
 * Design doc: ../../../design.md
 *
 * Run:  npx tsx permissions.ts   (zero runtime deps — nothing to install)
 *
 * Note: ESM only (matches the canonical TypeScript project layout).
 * tsconfig snippet: { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022" }
 */

// ── Core types ────────────────────────────────────────────────────────────────

/** How a tool may be invoked. Mirrors the Python `Permission` str-enum. */
const Permission = {
  ALWAYS: "always", // run without asking
  ASK: "ask", // require human approval first
  NEVER: "never", // refuse outright
} as const;
type Permission = (typeof Permission)[keyof typeof Permission];

/** One tool invocation request from the model. Mirrors schemas/state.py. */
interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  id?: string;
}

/** The outcome of gating one tool call. */
interface PermissionDecision {
  allowed: boolean;
  permission: Permission;
  reason: string;
}

/** Asks a human to approve one ASK-tier tool call; returns true to allow. */
type ApprovalPrompt = (call: ToolCall, reason: string) => boolean;

// ── Gate ──────────────────────────────────────────────────────────────────────

/**
 * Maps tool name -> {@link Permission} and decides whether a call may run.
 *
 * A tool absent from the map falls back to `default` (ASK) — a tool nobody
 * classified is treated as needing approval, never silently allowed.
 */
class PermissionGate {
  private readonly permissions: Map<string, Permission>;
  private readonly approve?: ApprovalPrompt;
  private readonly fallback: Permission;

  constructor(
    permissions: Record<string, Permission>,
    opts: { approve?: ApprovalPrompt; default?: Permission } = {},
  ) {
    this.permissions = new Map(Object.entries(permissions));
    this.approve = opts.approve;
    this.fallback = opts.default ?? Permission.ASK;
  }

  permissionFor(tool: string): Permission {
    return this.permissions.get(tool) ?? this.fallback;
  }

  check(call: ToolCall): PermissionDecision {
    const permission = this.permissionFor(call.tool);
    if (permission === Permission.ALWAYS) {
      return { allowed: true, permission, reason: "allowed (ALWAYS)" };
    }
    if (permission === Permission.NEVER) {
      return { allowed: false, permission, reason: `tool '${call.tool}' denied (NEVER)` };
    }
    const reason = `tool '${call.tool}' requires approval`;
    if (this.approve === undefined) {
      return { allowed: false, permission, reason: `${reason} but no approver configured` };
    }
    const approved = this.approve(call, reason);
    const verdict = approved ? "approved" : "declined";
    return { allowed: approved, permission, reason: `${reason} — ${verdict}` };
  }
}

// ── Example ────────────────────────────────────────────────────────────────────

function main(): void {
  const gate = new PermissionGate(
    {
      get_weather: Permission.ALWAYS,
      delete_file: Permission.NEVER,
      send_email: Permission.ASK,
    },
    { approve: (call) => call.args.to === "team@example.com" },
  );

  const samples: ToolCall[] = [
    { tool: "get_weather", args: { city: "Tokyo" } },
    { tool: "delete_file", args: { path: "/etc/passwd" } },
    { tool: "send_email", args: { to: "team@example.com" } },
    { tool: "send_email", args: { to: "stranger@example.net" } },
  ];
  for (const call of samples) {
    const decision = gate.check(call);
    console.log(`${call.tool}: allowed=${decision.allowed} — ${decision.reason}`);
  }
}

// ESM entry-point check.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { Permission, PermissionGate };
export type { ToolCall, PermissionDecision, ApprovalPrompt };
