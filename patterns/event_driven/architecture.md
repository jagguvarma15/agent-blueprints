# Event-Driven — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: consumer, role: code, responsibility: "Pull events; ack / retry / dead-letter" }
  - { id: handler, role: reasoner, responsibility: "Process one event (the agent)", port: model }
  - { id: idempotency_store, role: state, responsibility: "Dedup by event id", port: memory }
ports:
  - { name: model, protocol: model, required: true }
  - { name: runtime, protocol: runtime, required: true }
```

A consumer pulls events and invokes the handler per event, with an idempotency store to dedup and a dead-letter queue for poison messages.
