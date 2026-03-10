# Blueprint: Plan-and-Execute Agent

## Overview

The **Plan-and-Execute** pattern separates agent work into two phases:

1. **Planning**: create an explicit step-by-step plan.
2. **Execution**: run each step, using tools when needed, then synthesize the final answer.

Compared to pure ReAct loops, this pattern makes reasoning structure visible and easier to audit.

## When to Use This Pattern

- You need **predictable multi-step execution** with clear milestones.
- You want to **inspect or approve a plan** before the agent takes actions.
- Tasks involve **coordination across several dependent steps**.
- You need post-run artifacts like a **plan trace** for debugging or compliance.

## When NOT to Use This Pattern

- The task is single-turn and straightforward.
- Latency must be minimal; planning adds an extra model round-trip.
- You need highly dynamic, opportunistic tool usage with no fixed structure.

## Quickstart

### Python

```bash
cd blueprints/02-plan-and-execute/python
uv sync
cp .env.example .env
uv run dev
```

### TypeScript

```bash
cd blueprints/02-plan-and-execute/typescript
pnpm install
cp .env.example .env
pnpm dev
```

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key |
| `MODEL` | No | `claude-opus-4-6` | Model identifier |

## Key Concepts

- **Planner prompt**: forces JSON output for deterministic plan parsing.
- **Step executor**: runs one step at a time with bounded tool loops.
- **Synthesis stage**: merges step outputs into a final user-facing answer.
- **Guardrails**: `max_steps` and `max_tool_rounds_per_step` limit runaway execution.

## Extending This Blueprint

- Add a **human-approval checkpoint** after planning.
- Persist plans and outputs to a **task store** for resumability.
- Add specialized tools (SQL, ticketing, retrieval) and route by step type.
- Add confidence scoring and retry policy per step.

## Related Reading

- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
- [Plan-and-Solve Prompting](https://arxiv.org/abs/2305.04091)
- [Anthropic Tool Use Docs](https://docs.anthropic.com/en/docs/tool-use)
