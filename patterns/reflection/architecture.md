# Reflection — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: generator, role: reasoner, responsibility: "Produce a draft", port: model }
  - { id: critic, role: evaluator, responsibility: "Critique the draft against criteria", port: model }
ports:
  - { name: model, protocol: model, required: true }
```

A generator and a critic share the model port. The critic's feedback is fed back to the generator until the bar is met or the iteration cap fires.
