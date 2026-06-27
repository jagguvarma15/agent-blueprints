# Agentic RAG — Flow

> Flow level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=flow
control_flow: loop
steps:
  - { n: 1, actor: decomposer, action: "decompose into sub-questions" }
  - { n: 2, actor: retriever, action: "retrieve evidence per sub-question" }
  - { n: 3, actor: reflector, action: "assess sufficiency; loop or proceed" }
  - { n: 4, actor: synthesizer, action: "synthesize with citations" }
termination: { condition: "evidence sufficient", max_iterations: 4, fallback: "answer with caveats" }
```

A retrieval loop driven by a sufficiency reflector, then citation-bound synthesis with cross-source conflict checks to defend against single-source poisoning.
