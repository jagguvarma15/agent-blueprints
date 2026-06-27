# Evaluator-Optimizer — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: generator, role: reasoner, responsibility: "Produce a candidate", port: model }
  - { id: evaluator, role: evaluator, responsibility: "Score against criteria, emit feedback", port: model }
ports:
  - { name: model, protocol: model, required: true }
```

A generator/evaluator pair: the evaluator scores each candidate and feeds the score + feedback back to the generator. The agent form of this is Reflection.
