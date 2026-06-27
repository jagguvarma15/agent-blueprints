# Event-Driven — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: sequential
steps:
  - { n: 1, actor: consumer, action: "receive event" }
  - { n: 2, actor: handler, action: "process (dedup by id)" }
  - { n: 3, actor: consumer, action: "ack, retry, or dead-letter" }
termination: { condition: "event acked" }
```

One run per event. At-least-once delivery means duplicates are normal — dedup with an idempotency key before doing side effects.
