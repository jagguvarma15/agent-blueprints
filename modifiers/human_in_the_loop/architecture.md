# Human in the Loop — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: proposal, role: reasoner, responsibility: "Propose the action for review", port: model }
  - { id: approval_gate, role: policy, responsibility: "Pause for a human decision", port: runtime }
  - { id: audit_log, role: state, responsibility: "Record who decided what, when" }
ports:
  - { name: runtime, protocol: runtime, required: true }
```

A modifier that inserts an approval gate before a committing action. The gate is a kernel interrupt: the run suspends until a decision (and its resume token) arrives.
