# Plan & Execute — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: planner, role: reasoner, responsibility: "Produce an ordered plan", port: model }
  - { id: executor, role: engine, responsibility: "Run each step (often a bounded ReAct loop)", port: tools }
ports:
  - { name: model, protocol: model, required: true }
  - { name: tools, protocol: tools, required: true }
```

A planner emits the plan once; an executor runs each step, optionally as a bounded sub-agent. A replan hook handles deviation from the plan.
