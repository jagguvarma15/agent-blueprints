# Multi-Agent — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: hierarchical
steps:
  - { n: 1, actor: supervisor, action: "plan + decompose" }
  - { n: 2, actor: workers, action: "execute subtasks (parallel or sequential)" }
  - { n: 3, actor: aggregator, action: "merge results" }
termination: { condition: "supervisor accepts the merged result" }
```

The supervisor decides delegation at runtime (a planner policy); workers return distilled results that the aggregator merges. Budget each worker to bound cost.
