# Evaluator-Optimizer — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: loop
steps:
  - { n: 1, actor: generator, action: "generate a candidate" }
  - { n: 2, actor: evaluator, action: "score + give feedback" }
termination: { condition: "score >= threshold", max_iterations: 5, fallback: "return best candidate" }
```

Generate -> evaluate -> repeat until the score clears the bar or the iteration cap fires. Code owns the loop — this is a workflow.
