# ReAct (Reason + Act) — Overview

ReAct is the foundational agent pattern: a loop where the LLM *reasons* about what to do, *acts* by calling a tool, *observes* the result, and repeats until the task is complete. The LLM controls when to act and when to stop.

**Evolves from:** [Prompt Chaining](../../workflows/prompt-chaining/overview.md) — adds dynamic tool selection and LLM-controlled looping.

## Architecture

```mermaid
graph TD
    Input([User Task]) -->|"goal"| Loop[Agent Loop]
    Loop --> Think[Think:<br/>Reason about state + goal]
    Think --> Decide{Done?}
    Decide -->|"No"| ToolCall[Select & call tool]
    ToolCall -->|"tool request"| Execute[Execute tool]
    Execute -->|"observation"| Loop
    Decide -->|"Yes"| Output([Final Answer])
    Guard[/"Max Iterations"/] -.->|"force stop"| Output

    style Input fill:#e3f2fd
    style Loop fill:#f3e5f5
    style Think fill:#fff3e0
    style Decide fill:#fce4ec
    style ToolCall fill:#e8f5e9
    style Execute fill:#e8f5e9
    style Output fill:#e3f2fd
    style Guard fill:#fff8e1
```

*Figure: The ReAct loop. The LLM thinks, decides whether to act or respond, executes a tool if needed, and observes the result. A max iteration guard prevents infinite loops.*

## How It Works

1. The LLM receives the task and the available tool schemas
2. It generates a reasoning step ("I need to search for X because...")
3. It selects a tool and provides arguments
4. Your code executes the tool and returns the observation
5. The LLM reasons about the observation and decides the next action
6. Repeat until the LLM produces a final answer or hits the iteration limit

The key insight: the LLM interleaves *thinking* with *acting*. It doesn't just plan all steps upfront — it adapts based on what it discovers.

## Input / Output

- **Input:** A user task/question + a set of available tools (with schemas)
- **Output:** A final answer after zero or more tool calls
- **State:** Message history accumulating reasoning steps and observations

## Key Tradeoffs

| Strength | Limitation |
|----------|-----------|
| Handles open-ended, exploratory tasks | Unpredictable number of steps and cost |
| Adapts strategy based on observations | Can get stuck in loops or repeat failed actions |
| Simple to implement — one loop, one LLM | No upfront planning — may take inefficient paths |
| General-purpose — works for many task types | Reasoning quality degrades with long histories |
| Easy to add new tools without structural changes | Hard to test deterministically |

## When to Use

- Open-ended tasks where the steps aren't known in advance
- Tasks requiring tool use with adaptive behavior
- Question-answering that may need multiple information sources
- When you want the simplest possible agent architecture
- As the starting point before deciding you need a more complex pattern

## When NOT to Use

- When steps are known in advance — use [Prompt Chaining](../../workflows/prompt-chaining/overview.md)
- When the task needs upfront strategic planning — use [Plan & Execute](../plan-and-execute/overview.md)
- When quality needs iterative self-improvement — use [Reflection](../reflection/overview.md)
- When multiple specialized capabilities are needed — use [Multi-Agent](../multi-agent/overview.md)

## Related Patterns

- **Evolves from:** [Prompt Chaining](../../workflows/prompt-chaining/overview.md) — see [evolution.md](./evolution.md)
- **Builds on:** [Tool Use](../tool-use/overview.md) — ReAct requires tool use as a component
- **Extends into:** [Plan & Execute](../plan-and-execute/overview.md) (add planning), [Reflection](../reflection/overview.md) (add self-critique), [RAG](../rag/overview.md) (add retrieval), [Memory](../memory/overview.md) (add persistence)

## Deeper Dive

- **[Design](./design.md)** — Loop mechanics, message history management, tool dispatch, termination strategies
- **[Implementation](./implementation.md)** — Pseudocode, interfaces, prompt templates, testing approach
- **[Evolution](./evolution.md)** — How ReAct emerges from prompt chaining
