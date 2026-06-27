# Memory — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: store, role: state, responsibility: "Durable backend (vector / kv / graph)", port: memory }
  - { id: retriever, role: retriever, responsibility: "Fetch relevant memories" }
  - { id: writer, role: code, responsibility: "Persist new memories; evict/summarize" }
ports:
  - { name: memory, protocol: memory, required: true }
```

A memory store behind the memory port, with retrieve and write paths. This is durable/long-term memory — distinct from Run-State (working memory) and context assembly. See the [memory three-way split](../../core/design.md#the-memory-three-way-split).
