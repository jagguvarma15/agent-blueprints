# Plan & Execute — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: sequential
steps:
  - { n: 1, actor: planner, action: "produce the plan" }
  - { n: 2, actor: executor, action: "execute each step in order" }
termination: { condition: "all steps done", fallback: "replan on deviation" }
```

Plan upfront, then execute step by step. On a step failure or surprising result, replan rather than blindly continuing.
