# Sub-agents — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: sequential
steps:
  - { n: 1, actor: spawner, action: "spawn with a context envelope + tool grants" }
  - { n: 2, actor: sub_agent, action: "run in isolation" }
  - { n: 3, actor: collector, action: "collect a distilled result" }
termination: { condition: "sub-agent returns" }
```

Context isolation is the value: a sub-agent returns a small summary, not its full transcript, so the parent stays focused.
