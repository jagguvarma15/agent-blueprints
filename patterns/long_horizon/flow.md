# Long-Horizon — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: loop
steps:
  - { n: 1, actor: planner, action: "select next phase" }
  - { n: 2, actor: workers, action: "execute phase, then checkpoint" }
  - { n: 3, actor: checkpointer, action: "persist; suspend on external wait" }
termination: { condition: "goal met", fallback: "resume from last checkpoint on wake" }
```

Plan, execute a phase, checkpoint, possibly suspend for a long wait, then resume. Requires the durable runtime tier, not just in-process checkpoints.
