# RAG — Architecture

> Architecture level. See [Design](./design.md) for the full walkthrough; [Overview](./overview.md) for when to use this pattern.

```yaml level=architecture
components:
  - { id: retriever, role: retriever, responsibility: "Embed the query and fetch top-k chunks", port: memory }
  - { id: prompt_builder, role: code, responsibility: "Assemble retrieved context into the prompt" }
  - { id: generator, role: reasoner, responsibility: "Generate the grounded answer", port: model }
ports:
  - { name: model, protocol: model, required: true }
  - { name: memory, protocol: memory, required: true }
```

A retriever (bound to the memory port) fetches evidence, a prompt builder assembles it, and the generator answers from it. The retrieval quality ceiling caps the answer quality.
