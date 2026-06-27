# Tool Use — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: sequential
steps:
  - { n: 1, actor: registry, action: "model emits a tool call" }
  - { n: 2, actor: permission_gate, action: "check permission tier" }
  - { n: 3, actor: dispatcher, action: "validate, execute, observe" }
termination: { condition: "observation returned" }
```

Per-call: validate against the schema, gate by permission, execute, return an observation. Unclassified tools default to Ask — fail safe.
