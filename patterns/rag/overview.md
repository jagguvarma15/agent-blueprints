# RAG (Retrieval-Augmented Generation) — Overview

RAG grounds LLM responses in external knowledge by retrieving relevant documents before generating a response. Instead of relying solely on the LLM's training data, the system searches a knowledge base and injects the most relevant content into the prompt.

**Evolves from:** [Parallel Calls](../../workflows/parallel-calls/overview.md) — adds a retrieval step, context injection, and relevance filtering.

## Architecture

```mermaid
graph TD
    Input([User Query]) -->|"question"| Embedder[Embed Query]
    Embedder -->|"query vector"| Search[Vector Search]
    Docs[(Document Store)] -->|"indexed documents"| Search
    Search -->|"top-K chunks"| Filter[Relevance Filter]
    Filter -->|"relevant context"| Augment[Augment Prompt]
    Input -->|"original question"| Augment
    Augment -->|"question + context"| LLM[LLM: Generate Answer]
    LLM -->|"grounded response"| Output([Response])

    style Input fill:#e3f2fd
    style Embedder fill:#fff8e1
    style Search fill:#f3e5f5
    style Docs fill:#e8f5e9
    style Filter fill:#fce4ec
    style Augment fill:#fff3e0
    style LLM fill:#fff3e0
    style Output fill:#e3f2fd
```

*Figure: The query is embedded and used to search a document store. Retrieved chunks are filtered for relevance, injected into the prompt, and the LLM generates a grounded response.*

## How It Works

**Ingestion (offline):**
1. **Load** documents from your knowledge source
2. **Chunk** documents into retrieval-sized pieces (typically 200–1000 tokens)
3. **Embed** each chunk into a vector representation
4. **Store** vectors in a searchable index (vector database)

**Query (online):**
1. **Embed** the user's query using the same embedding model
2. **Search** the vector store for the most similar chunks (top-K)
3. **Filter** results for relevance (similarity threshold, metadata filters)
4. **Augment** the LLM prompt with the retrieved context
5. **Generate** a response grounded in the retrieved documents

## Input / Output

- **Input:** User query + document store (pre-indexed)
- **Output:** LLM response grounded in retrieved document content
- **Retrieved context:** Top-K document chunks most relevant to the query
- **Ingestion input:** Raw documents (text, PDF, HTML, etc.)

## Key Tradeoffs

| Strength | Limitation |
|----------|-----------|
| Grounds responses in factual sources | Retrieval quality limits response quality |
| Reduces hallucination for knowledge-heavy tasks | Requires maintaining and indexing a document store |
| Knowledge can be updated without retraining | Chunking strategy significantly affects results |
| Works with any LLM — no fine-tuning needed | Retrieved context consumes context window tokens |
| Provides source attribution | Embedding quality affects search accuracy |

## When to Use

- Question-answering over a specific knowledge base (docs, policies, code)
- When the LLM needs information not in its training data
- When responses must be grounded in specific source documents
- When you need source attribution ("answer based on document X, section Y")
- When knowledge changes frequently and fine-tuning isn't practical

## When NOT to Use

- When all needed information fits in the system prompt — just include it directly
- When the task doesn't require external knowledge (creative writing, reasoning)
- When real-time data is needed — RAG over a static index will be stale
- When exact database queries would be more appropriate — use [Tool Use](../tool-use/overview.md) with a DB query tool

## Related Patterns

- **Evolves from:** [Parallel Calls](../../workflows/parallel-calls/overview.md) — see [evolution.md](./evolution.md)
- **Combines with:** [ReAct](../react/overview.md) (agent decides when to retrieve), [Memory](../memory/overview.md) (shared vector store for both documents and interaction history)
- **Advanced form:** Agentic RAG — the agent decides when, what, and how to retrieve, potentially reformulating queries or searching multiple sources

## Deeper Dive

- **[Design](./design.md)** — Chunking strategies, embedding selection, retrieval tuning, relevance filtering, re-ranking
- **[Implementation](./implementation.md)** — Pseudocode, ingestion pipeline, query pipeline, testing with fixtures
- **[Evolution](./evolution.md)** — How RAG evolves from parallel calls
