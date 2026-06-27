# Multi-Agent — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: supervisor, role: router, responsibility: "Plan and delegate subtasks", port: model }
  - { id: workers, role: reasoner, responsibility: "Specialized autonomous sub-agents", port: agents }
  - { id: aggregator, role: reducer, responsibility: "Merge worker results" }
ports:
  - { name: model, protocol: model, required: true }
  - { name: agents, protocol: agents, required: true }
```

A supervisor delegates to role-scoped workers (in-process sub-graphs or remote A2A agents) and aggregates their results. Clear per-worker contracts prevent divergence.
