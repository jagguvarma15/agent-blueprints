# Saga — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: sequential
steps:
  - { n: 1, actor: orchestrator, action: "execute each forward step" }
  - { n: 2, actor: orchestrator, action: "on failure, run compensators in reverse" }
termination: { condition: "all steps committed, or fully compensated" }
```

Execute forward; on any failure, walk the compensation stack backward. Compensators must be idempotent because they may be retried.
