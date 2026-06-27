# RAG — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: sequential
steps:
  - { n: 1, actor: retriever, action: "embed query, fetch top-k" }
  - { n: 2, actor: prompt_builder, action: "build context window" }
  - { n: 3, actor: generator, action: "generate grounded answer" }
termination: { condition: "answer generated", max_iterations: 1 }
```

A single retrieve-then-generate pass. Agentic variants loop retrieval — see [Agentic RAG](../agentic_rag/overview.md).
