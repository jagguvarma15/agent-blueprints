# Long-Horizon — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: planner, role: reasoner, responsibility: "Maintain the long-running plan", port: model }
  - { id: filesystem, role: state, responsibility: "Virtual filesystem for durable working state", port: memory }
  - { id: workers, role: reasoner, responsibility: "Bounded sub-agents per phase", port: agents }
  - { id: checkpointer, role: state, responsibility: "Persist run state per step", port: runtime }
ports:
  - { name: model, protocol: model, required: true }
  - { name: memory, protocol: memory, required: true }
  - { name: runtime, protocol: runtime, required: true }
  - { name: agents, protocol: agents, required: false }
```

A planner over a durable virtual filesystem drives bounded sub-agents, checkpointing after each step so the run survives crashes and resumes on wake.
