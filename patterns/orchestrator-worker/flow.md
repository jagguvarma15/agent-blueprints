# Orchestrator-Worker — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: sequential
steps:
  - { n: 1, actor: orchestrator, action: "decompose the task" }
  - { n: 2, actor: workers, action: "execute each subtask" }
  - { n: 3, actor: synthesizer, action: "synthesize the result" }
termination: { condition: "synthesis complete" }
```

The orchestrator picks the next move (a planner policy over LLM workers); unlike multi-agent, workers are plain LLM calls without their own tool loops.
