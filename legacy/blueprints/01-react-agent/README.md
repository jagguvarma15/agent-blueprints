# Blueprint: ReAct Agent

## Overview

The **ReAct (Reasoning + Acting)** pattern is one of the most fundamental and widely-used agentic
architectures. It interleaves reasoning traces ("thoughts") with concrete actions (tool calls),
allowing an agent to think step-by-step, act on the world, observe results, and continue until it
reaches a final answer.

This blueprint provides a production-ready ReAct agent implementation in both Python and TypeScript
using the Anthropic SDK with Claude.

## Problem Statement

Large language models are powerful reasoners, but they lack access to real-time information, cannot
perform precise computation, and cannot interact with external systems. Pure chain-of-thought
prompting improves reasoning but still leaves the model isolated from the world.

**Core challenges addressed:**
- How do we give a model access to external tools while maintaining coherent reasoning?
- How do we handle multi-step problems that require iterative information gathering?
- How do we prevent infinite loops while allowing sufficient exploration?
- How do we make tool use and reasoning transparent and debuggable?

## Solution

The ReAct pattern solves this by creating an **agent loop** that alternates between:

1. **Reasoning** — The model thinks about what to do next given the current context
2. **Acting** — The model calls a tool with specific inputs
3. **Observing** — The tool result is added to the conversation history
4. **Repeating** — Steps 1-3 repeat until the model produces a final answer

Claude's native tool use API makes this pattern clean to implement: when the model wants to call a
tool, it returns a `tool_use` content block. When the stop reason is `tool_use`, the agent loop
dispatches the tool, collects the result, and sends everything back to the model.

```
User Query → [Think → Tool Call → Observe] × N → Final Answer
```

## When to Use / When NOT to Use

### Use ReAct when:
- The task requires **multiple steps** to complete (e.g., "research X, then compute Y using that")
- You need **real-time or external information** (search, APIs, databases)
- The agent needs to **adapt its plan** based on intermediate results
- Transparency and **step-by-step auditability** are important
- The task involves **tool composition** (chaining multiple tools together)

### Do NOT use ReAct when:
- The task is a **single-turn question** with no tool use needed — just call the model directly
- You have **strict latency requirements** — each tool call adds a round-trip
- The task is **highly structured** with a fixed sequence of steps — use an orchestrated pipeline
- Tools are **expensive or irreversible** and you need stronger safety guarantees — consider a
  plan-then-execute pattern with human approval
- You need **parallel tool execution** — vanilla ReAct is sequential; consider a parallel tool-call
  variant instead

## Trade-offs

| Aspect | Benefit | Cost |
|--------|---------|------|
| Flexibility | Agent can adapt mid-task | Unpredictable number of steps |
| Transparency | Reasoning visible in message history | Verbose context window usage |
| Tool composition | Can combine multiple tools | Sequential execution adds latency |
| Simplicity | Easy to implement and debug | Less efficient than specialized pipelines |
| Generality | Works for many task types | Not optimal for any single task type |

## Quick Start (< 5 commands)

### Python

```bash
cd blueprints/01-react-agent/python

# Install dependencies (requires uv: https://docs.astral.sh/uv/)
uv sync

# Configure your API key
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Run the agent
uv run dev
```

### TypeScript

```bash
cd blueprints/01-react-agent/typescript

# Install dependencies (requires pnpm: https://pnpm.io/)
pnpm install

# Configure your API key
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Run the agent
pnpm dev
```

## Configuration

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | Your Anthropic API key |
| `MODEL` | No | `claude-opus-4-6` | Claude model to use |
| `MAX_ITERATIONS` | No | `10` | Maximum agent loop iterations |

### Tuning `max_iterations`

The `max_iterations` parameter is a safety guardrail to prevent runaway loops:
- **Too low** (< 5): Agent may not complete complex multi-step tasks
- **Too high** (> 20): Risk of excessive API calls; consider if the task is well-scoped
- **10** is a reasonable default for most tasks

### Adding Custom Tools

**Python:** Add a function to `src/tools.py` and register it in `TOOL_DEFINITIONS`:

```python
def my_tool(param: str) -> str:
    return f"Result for {param}"

TOOL_DEFINITIONS = [
    # ... existing tools ...
    {
        "name": "my_tool",
        "description": "What this tool does",
        "input_schema": {
            "type": "object",
            "properties": {
                "param": {"type": "string", "description": "The input parameter"}
            },
            "required": ["param"]
        }
    }
]
```

**TypeScript:** Add to `src/tools.ts`:

```typescript
export function myTool({ param }: { param: string }): string {
    return `Result for ${param}`;
}

export const TOOL_DEFINITIONS: Tool[] = [
    // ... existing tools ...
    {
        name: "my_tool",
        description: "What this tool does",
        input_schema: {
            type: "object",
            properties: {
                param: { type: "string", description: "The input parameter" }
            },
            required: ["param"]
        }
    }
];
```

## Related Patterns

| Pattern | When to prefer it |
|---------|-------------------|
| **02: Parallel Tool Calls** | When tools can be executed concurrently to reduce latency |
| **03: Plan-and-Execute** | When you need to audit/approve the plan before executing |
| **04: Multi-Agent** | When tasks benefit from specialized sub-agents |
| **05: Human-in-the-Loop** | When actions are irreversible and need human approval |

## Further Reading

- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629) — Original paper by Yao et al. (2022)
- [Anthropic Tool Use Documentation](https://docs.anthropic.com/en/docs/tool-use)
- [Anthropic Agent Building Guide](https://docs.anthropic.com/en/docs/build-with-claude/agents)
- [Building Effective Agents (Anthropic Blog)](https://www.anthropic.com/research/building-effective-agents)
