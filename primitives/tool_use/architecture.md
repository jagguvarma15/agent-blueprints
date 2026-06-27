# Tool Use — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: registry, role: effector, responsibility: "Map tool name to schema + handler", port: tools }
  - { id: permission_gate, role: policy, responsibility: "Always/Ask/Never gate before execution" }
  - { id: dispatcher, role: code, responsibility: "Validate args, route, capture observation" }
ports:
  - { name: model, protocol: model, required: true }
  - { name: tools, protocol: tools, required: true }
```

A typed registry exposes schemas to the model and handlers to the dispatcher; a permission gate (Always/Ask/Never) sits in front of execution. This primitive contributes the tools port.
