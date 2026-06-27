# Memory — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: sequential
steps:
  - { n: 1, actor: retriever, action: "fetch relevant memories for the task" }
  - { n: 2, actor: writer, action: "persist new salient memories" }
termination: { condition: "per operation" }
```

Retrieve at the start, write at the end. Bound growth with summarization or eviction so the store does not become noise.
