# Guardrails — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: input_filter, role: policy, responsibility: "Screen input before it reaches the agent" }
  - { id: tool_gate, role: policy, responsibility: "Gate tool calls (wraps the dispatcher)" }
  - { id: output_validator, role: policy, responsibility: "Validate output before it commits" }
  - { id: quarantined_reader, role: reasoner, responsibility: "Read untrusted content in an unprivileged context", port: model }
ports:
  - { name: model, protocol: model, required: true }
```

A modifier that wraps the pattern: layered input/tool/output checks, plus a privileged-actor / quarantined-reader split so untrusted content can never directly drive tool calls.
