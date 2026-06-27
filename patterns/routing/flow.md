# Routing — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: router
steps:
  - { n: 1, actor: classifier, action: "classify the input" }
  - { n: 2, actor: dispatcher, action: "dispatch to the matching handler" }
termination: { condition: "handler completes" }
```

The classifier's decision picks exactly one branch. Calibrate a confidence threshold and route below-threshold inputs to a fallback.
