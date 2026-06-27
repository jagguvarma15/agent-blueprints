# Agentic RAG — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: decomposer, role: reasoner, responsibility: "Split the question into sub-questions", port: model }
  - { id: retriever, role: retriever, responsibility: "Retrieve per sub-question across sources", port: memory }
  - { id: reflector, role: evaluator, responsibility: "Judge sufficiency; loop if needed", port: model }
  - { id: synthesizer, role: reasoner, responsibility: "Compose a citation-bound answer", port: model }
ports:
  - { name: model, protocol: model, required: true }
  - { name: memory, protocol: memory, required: true }
```

The agent plans retrievals, routes across sources, reflects on whether the evidence is sufficient, loops if not, then synthesizes a cited, cross-checked answer.
