# Guardrails — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: wrapping
steps:
  - { n: 1, actor: input_filter, action: "screen input" }
  - { n: 2, actor: tool_gate, action: "gate each tool call" }
  - { n: 3, actor: output_validator, action: "validate output" }
termination: { condition: "per wrapped call" }
```

Guardrails wrap the host pattern rather than replacing its flow. Defense-in-depth: no single layer is assumed sufficient.
