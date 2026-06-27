# Skills — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: sequential
steps:
  - { n: 1, actor: registry, action: "discover a relevant skill" }
  - { n: 2, actor: loader, action: "load it into context" }
  - { n: 3, actor: executor, action: "execute the skill" }
termination: { condition: "skill completes" }
```

Just-in-time loading is the point: progressive disclosure keeps the working context focused on the task at hand.
