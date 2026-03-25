# RAG — Implementation

## Core Interfaces

```
Chunk:
  id: string
  text: string
  metadata: {source, page, section}
  embedding: vector

RAGConfig:
  chunk_size: integer                    // Default: 500
  chunk_overlap: integer                 // Default: 50
  top_k: integer                        // Default: 5
  similarity_threshold: float            // Default: 0.7
  max_context_tokens: integer            // Default: 3000
```

## Core Pseudocode

### ingest

```
function ingest(documents, config, vector_store):
  for doc in documents:
    chunks = chunk_document(doc, config.chunk_size, config.chunk_overlap)
    for chunk in chunks:
      chunk.embedding = embed(chunk.text)
      vector_store.insert(chunk)
```

### chunk_document

```
function chunk_document(document, size, overlap):
  chunks = []
  tokens = tokenize(document.text)
  position = 0

  while position < tokens.length:
    end = min(position + size, tokens.length)
    chunk_text = detokenize(tokens[position:end])
    chunks.append({
      id: document.id + "_" + position,
      text: chunk_text,
      metadata: {source: document.source, position: position}
    })
    position = position + size - overlap

  return chunks
```

### query

```
function query(question, config, vector_store):
  // Embed question
  query_embedding = embed(question)

  // Search
  results = vector_store.search(query_embedding, top_k: config.top_k * 2)

  // Filter by relevance
  relevant = [r for r in results if r.similarity >= config.similarity_threshold]
  relevant = relevant[:config.top_k]

  if relevant.length == 0:
    return call_llm(
      system: "You are a helpful assistant. If you don't have information, say so.",
      message: question
    ).text

  // Build context
  context = build_context(relevant, config.max_context_tokens)

  // Generate grounded response
  response = call_llm(
    system: "Answer based on the provided context. Cite sources when possible. " +
            "If the context doesn't contain the answer, say so.",
    message: "Context:\n" + context + "\n\nQuestion: " + question
  )

  return response.text
```

### build_context

```
function build_context(chunks, max_tokens):
  context_parts = []
  total_tokens = 0

  for chunk in chunks:
    chunk_tokens = count_tokens(chunk.text)
    if total_tokens + chunk_tokens > max_tokens:
      break
    context_parts.append("[Source: " + chunk.metadata.source + "]\n" + chunk.text)
    total_tokens += chunk_tokens

  return join(context_parts, "\n\n---\n\n")
```

## State Management

Ingestion is stateless (batch process). Query maintains no state between calls unless combined with [Memory](../memory/overview.md).

## Prompt Engineering Notes

### Generation Prompt
```
System:
Answer the question based on the provided context documents.
- If the answer is in the context, provide it and cite the source
- If the answer is partially in the context, provide what you can and note gaps
- If the answer is not in the context, say "I don't have information on this"
- Do not make up information that isn't in the context
```

## Testing Strategy

- **Chunking tests:** Known document → verify chunk count, overlap, boundaries
- **Retrieval tests:** Ingest known docs → query → verify relevant docs returned
- **Generation tests:** Fixed context + question → verify grounded answer
- **No-result tests:** Query with no matching docs → verify graceful handling

## Common Pitfalls

- **Bad chunking:** Splitting mid-sentence breaks meaning. Fix: respect sentence/paragraph boundaries.
- **Context overflow:** Too many chunks overflow context window. Fix: enforce max_context_tokens budget.
- **Embedding mismatch:** Different models for ingestion and query. Fix: always use the same model.
- **Missing sources:** Retrieved chunks lack source info. Fix: include metadata during ingestion.
