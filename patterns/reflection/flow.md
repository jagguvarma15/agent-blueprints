# Reflection — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: loop
steps:
  - { n: 1, actor: generator, action: "draft" }
  - { n: 2, actor: critic, action: "critique against criteria" }
  - { n: 3, actor: generator, action: "revise using feedback" }
termination: { condition: "critic approves", max_iterations: 3, fallback: "return best draft" }
```

Generate -> critique -> revise, looping until the critic approves or max_iterations. Calibrate the critic so it is neither too lenient nor too strict.
