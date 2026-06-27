# Saga — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: orchestrator, role: engine, responsibility: "Run steps; unwind compensations on failure" }
  - { id: steps, role: effector, responsibility: "Each step: a forward action + a compensator", port: tools }
ports:
  - { name: tools, protocol: tools, required: true }
```

The orchestrator keeps a compensation stack: on failure it unwinds executed steps in reverse via their compensators. Compensation is path-dependent, so it lives in the engine, not static edges.
