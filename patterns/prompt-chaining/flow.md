# Prompt Chaining — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: sequential
steps:
  - { n: 1, actor: steps, action: "stage 1" }
  - { n: 2, actor: gates, action: "validate; pass or abort" }
  - { n: 3, actor: steps, action: "stage 2 (consumes stage 1)" }
termination: { condition: "final stage completes" }
```

Code picks the next step (a static graph). Gates catch errors early so they do not propagate down the chain.
