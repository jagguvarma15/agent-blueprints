# Parallel Calls — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: parallel
steps:
  - { n: 1, actor: fan_out, action: "split into N units" }
  - { n: 2, actor: workers, action: "run N calls concurrently" }
  - { n: 3, actor: aggregator, action: "aggregate (merge or vote)" }
termination: { condition: "all (or a quorum of) results returned" }
```

Concurrency cuts wall-clock to the slowest call. The reducer is the barrier — decide whether it needs all results or a quorum.
