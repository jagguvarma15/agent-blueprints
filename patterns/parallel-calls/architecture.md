# Parallel Calls — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: fan_out, role: code, responsibility: "Split work into independent units" }
  - { id: workers, role: reasoner, responsibility: "Concurrent LLM calls", port: model }
  - { id: aggregator, role: reducer, responsibility: "Merge / vote on results" }
ports:
  - { name: model, protocol: model, required: true }
```

Work fans out to concurrent LLM calls and the results are reduced (merged or voted). A reducer handles partial failures via quorum.
