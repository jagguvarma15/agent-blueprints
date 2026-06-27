# Human in the Loop — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: wrapping
steps:
  - { n: 1, actor: proposal, action: "propose the action" }
  - { n: 2, actor: approval_gate, action: "interrupt; await human decision" }
  - { n: 3, actor: proposal, action: "commit, deny, or apply the edit" }
termination: { condition: "decision recorded" }
```

The interrupt suspends and checkpoints the run until a human responds; long waits need at least the checkpoint durability tier.
