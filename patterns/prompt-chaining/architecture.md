# Prompt Chaining — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: steps, role: reasoner, responsibility: "Ordered LLM stages", port: model }
  - { id: gates, role: code, responsibility: "Validate between stages; abort on failure" }
ports:
  - { name: model, protocol: model, required: true }
```

A fixed chain of LLM stages with validation gates between them. The developer owns the control flow — this is a workflow, not an agent.
