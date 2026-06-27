# Orchestrator-Worker — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: orchestrator, role: router, responsibility: "Decompose + delegate at runtime", port: model }
  - { id: workers, role: reasoner, responsibility: "Execute one subtask each", port: model }
  - { id: synthesizer, role: reducer, responsibility: "Combine worker outputs" }
ports:
  - { name: model, protocol: model, required: true }
```

The orchestrator decides the decomposition at runtime (so it is more dynamic than prompt chaining) and synthesizes the workers' outputs into a result.
