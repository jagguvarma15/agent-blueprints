# Orchestrator-Worker — Overview

The orchestrator-worker pattern uses a central LLM to decompose a complex task into subtasks, delegates each subtask to a worker LLM call, then synthesizes the results. Unlike parallel calls, the orchestrator *reasons* about how to split the work.

## Architecture

```mermaid
graph TD
    Input([Input]) -->|"complex task"| Orch[Orchestrator LLM:<br/>Decompose task]
    Orch -->|"subtask_1"| W1[Worker LLM 1]
    Orch -->|"subtask_2"| W2[Worker LLM 2]
    Orch -->|"subtask_3"| W3[Worker LLM 3]
    W1 -->|"result_1"| Synth[Synthesizer LLM:<br/>Merge results]
    W2 -->|"result_2"| Synth
    W3 -->|"result_3"| Synth
    Synth -->|"final output"| Output([Output])

    style Input fill:#e3f2fd
    style Orch fill:#fff8e1
    style W1 fill:#fff3e0
    style W2 fill:#fff3e0
    style W3 fill:#fff3e0
    style Synth fill:#e8f5e9
    style Output fill:#e3f2fd
```

*Figure: The orchestrator decomposes the task, workers process subtasks in parallel, and a synthesizer merges results. The orchestrator decides both what subtasks to create and how many workers are needed.*

## How It Works

1. **Orchestrate** — The orchestrator LLM receives the full task and produces a decomposition: a list of subtasks with descriptions and any relevant context.
2. **Delegate** — Each subtask is sent to a worker LLM call. Workers can run in parallel if subtasks are independent, or sequentially if there are dependencies.
3. **Execute** — Workers process their subtasks. Each worker gets a focused prompt for its specific subtask plus relevant context from the orchestrator.
4. **Synthesize** — A synthesis step (often an LLM call itself) combines worker results into a coherent final output.

The key difference from [Parallel Calls](../parallel-calls/overview.md) is that the *orchestrator decides the decomposition at runtime* using LLM reasoning, rather than the developer defining it in code.

## Input / Output

- **Input:** A complex task too large or multifaceted for a single LLM call
- **Output:** A synthesized result incorporating all worker outputs
- **Orchestrator output:** A structured list of subtasks (task description, context, dependencies)
- **Worker output:** Individual subtask results

## Key Tradeoffs

| Strength | Limitation |
|----------|-----------|
| Handles tasks that can't be pre-decomposed | At least 3 LLM calls minimum (orchestrate + 1 worker + synthesize) |
| Dynamic decomposition adapts to input complexity | Orchestrator quality is critical — bad decomposition = bad results |
| Workers can be specialized with different prompts | Synthesis can lose nuance from individual worker outputs |
| Naturally parallelizable worker execution | Higher cost than direct parallel calls due to orchestrator overhead |
| Clean separation of concerns | Inter-subtask dependencies complicate parallel execution |

## When to Use

- Complex tasks that require LLM-driven decomposition (the developer can't predict the subtasks)
- Tasks with variable structure — different inputs may need different subtask breakdowns
- When worker subtasks benefit from specialized prompts or different model configurations
- Large content generation requiring multiple specialized sections
- Analysis tasks spanning multiple domains or data sources

## When NOT to Use

- When the decomposition is known in advance — use [Parallel Calls](../parallel-calls/overview.md) or [Prompt Chaining](../prompt-chaining/overview.md)
- When subtasks need iterative refinement — combine with [Evaluator-Optimizer](../evaluator-optimizer/overview.md)
- When workers need to act autonomously with tools — evolve to [Multi-Agent](../../patterns/multi-agent/overview.md)
- When the task is simple enough for a single LLM call — don't over-engineer

## Related Patterns

- **Evolves into:** [Plan & Execute](../../patterns/plan-and-execute/overview.md) (add step tracking, replanning on failure), [Multi-Agent](../../patterns/multi-agent/overview.md) (give workers tools and autonomy)
- **Combines with:** [Evaluator-Optimizer](../evaluator-optimizer/overview.md) (evaluate synthesized output), [Parallel Calls](../parallel-calls/overview.md) (for the worker execution phase)
- **Simpler alternative:** [Parallel Calls](../parallel-calls/overview.md) (when decomposition is code-defined)

## Deeper Dive

- **[Design](./design.md)** — Decomposition strategies, worker specialization, synthesis patterns, dependency handling
- **[Implementation](./implementation.md)** — Pseudocode, orchestrator prompt design, worker management, testing
