# Sub-agents — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: spawner, role: router, responsibility: "Create a sub-agent with a context envelope", port: agents }
  - { id: sub_agent, role: reasoner, responsibility: "Run in an isolated context window", port: model }
  - { id: collector, role: reducer, responsibility: "Collect the distilled result" }
ports:
  - { name: model, protocol: model, required: true }
  - { name: agents, protocol: agents, required: true }
```

A parent spawns role-scoped sub-agents with their own context windows and tool grants; each returns a distilled summary, keeping the parent's context clean.
