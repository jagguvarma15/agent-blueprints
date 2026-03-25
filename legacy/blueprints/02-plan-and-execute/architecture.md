# Architecture: Plan-and-Execute Agent

## High-Level Flow

```mermaid
flowchart TD
    A[User Query] --> B[Planner LLM]
    B --> C{Valid JSON plan?}
    C -->|No| X[Return planning failure]
    C -->|Yes| D[Plan Steps]
    D --> E[Execute Step 1]
    E --> F{Need tools?}
    F -->|Yes| G[Tool Call + Result]
    G --> E
    F -->|No| H[Step Output]
    H --> I{More steps?}
    I -->|Yes| J[Execute Next Step]
    J --> F
    I -->|No| K[Synthesizer LLM]
    K --> L[Final Answer]
```

## Components

- **Planner**: converts the user request into a compact JSON array of steps.
- **Executor**: iterates through steps and can invoke tools per step.
- **Tool registry**: maps tool names to local implementations.
- **Synthesizer**: transforms step-level outputs into one final response.

## Failure Modes and Handling

- Invalid plan JSON: return a clear planning failure message.
- Unknown tool: convert tool errors into text and keep execution moving.
- Runaway steps: cap with `max_tool_rounds_per_step`.
- Overly long plans: truncate with `max_steps`.

## Trade-offs

- Better interpretability than ReAct, but higher latency.
- Stronger control flow, but less flexible than free-form tool loops.
- Easier governance and auditing, at the cost of extra prompting overhead.
