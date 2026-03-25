# Blueprint 07: RAG Basic

## Overview

**Retrieval-Augmented Generation (RAG)** is a foundational pattern for grounding LLM responses in
private, domain-specific, or up-to-date knowledge. Instead of relying solely on what the model
learned during training, RAG fetches relevant document chunks at query time and injects them into
the prompt as context — giving the model the information it needs to answer accurately.

This blueprint provides a production-ready RAG implementation in both Python and TypeScript using
the Anthropic SDK, ChromaDB as a vector store, and Anthropic's embedding model for semantic search.

## Problem Statement

Large language models are trained on static snapshots of public data. They cannot:
- Access your **private documents**, internal wikis, or proprietary knowledge bases
- Reflect **recent events** that occurred after their training cutoff
- Cite **specific sources** from your corpus with confidence
- Avoid **hallucinating** answers when asked about topics outside their training data

Naively stuffing all your documents into the context window does not scale — context windows have
limits, costs grow linearly with tokens, and irrelevant information degrades answer quality.

**Core challenges addressed:**
- How do we efficiently retrieve only the most relevant document chunks for a given query?
- How do we keep retrieval fast even as the knowledge base grows to millions of documents?
- How do we cite sources so users can verify answers?
- How do we prevent the model from "going off-script" when the answer isn't in the retrieved context?

## Solution

RAG solves this with a two-phase architecture:

### Ingestion Pipeline (run once, or on document update)

1. **Load** — Read raw documents from disk (`.txt`, `.md`, or other formats)
2. **Chunk** — Split documents into overlapping windows so no context is lost at chunk boundaries
3. **Embed** — Convert each chunk into a dense vector using an embedding model
4. **Store** — Persist vectors and metadata in a vector database (ChromaDB)

### Query Pipeline (run at inference time)

1. **Embed query** — Convert the user's question into a vector using the same embedding model
2. **Retrieve** — Find the top-K most semantically similar chunks via vector similarity search
3. **Augment** — Inject retrieved chunks into the LLM prompt as context
4. **Generate** — The LLM answers using only the provided context, citing sources

```
[Ingestion]  Documents → Chunker → Embedder → Vector Store
[Query]      Question  → Embedder → Vector Store → Chunks → LLM → Answer
```

## When to Use

- You have a **private knowledge base** (internal docs, wikis, codebases, PDFs) that the model
  cannot access from training data
- You need **up-to-date information** that changes frequently (product catalogs, changelogs, news)
- You require **source citations** — RAG naturally returns which documents were used
- Your corpus is **too large** to fit in a single context window
- You want to **reduce hallucination** by constraining the model to retrieved facts
- You need **access control** — different users can be served from different collections

## When NOT to Use

- **Simple factual queries** that the base model already answers correctly — RAG adds latency and
  cost with no benefit
- **Real-time data** (stock prices, live sensor feeds) — use tool calls to query a live API instead
- **Tiny corpora** (< 20 documents) — just put everything in the system prompt
- **Highly structured queries** (SQL-like lookups on tabular data) — use a database with a
  text-to-SQL approach instead
- You need **multi-hop reasoning** over many documents — basic RAG retrieves flat chunks; consider
  graph RAG or iterative retrieval patterns

## Trade-offs

| Aspect | Benefit | Cost |
|--------|---------|------|
| Knowledge freshness | Update docs without retraining | Ingestion pipeline required |
| Answer accuracy | Grounded in retrieved facts | Quality depends on retrieval quality |
| Scalability | Vector search scales to millions of docs | Embedding costs at ingestion time |
| Latency | Single retrieval round-trip | ~100–300 ms added vs. direct LLM call |
| Transparency | Sources are returned with the answer | Users may over-trust cited sources |
| Simplicity | Straightforward to implement | Chunk size tuning required |

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (for ChromaDB)
- Python 3.11+ with [uv](https://docs.astral.sh/uv/) OR Node.js 18+ with [pnpm](https://pnpm.io/)
- An Anthropic API key

### 1. Start ChromaDB

```bash
cd blueprints/07-rag-basic
docker-compose up -d
```

ChromaDB will be available at `http://localhost:8000`.

### Python

```bash
cd blueprints/07-rag-basic/python

# Install dependencies
uv sync

# Configure environment
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY

# Run ingestion + demo queries
uv run dev
```

### TypeScript

```bash
cd blueprints/07-rag-basic/typescript

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY

# Run ingestion + demo queries
pnpm dev
```

## Configuration

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | Your Anthropic API key |
| `CHROMA_HOST` | No | `localhost` | ChromaDB host |
| `CHROMA_PORT` | No | `8000` | ChromaDB port |
| `COLLECTION_NAME` | No | `documents` | ChromaDB collection name |
| `CHUNK_SIZE` | No | `500` | Target chunk size in characters |
| `CHUNK_OVERLAP` | No | `50` | Overlap between adjacent chunks |
| `TOP_K` | No | `5` | Number of chunks to retrieve per query |
| `MODEL` | No | `claude-opus-4-6` | Claude model for generation |

### Tuning Chunk Size

Chunk size is the most impactful parameter:
- **Too small** (< 100 chars): Chunks lose context; retrieval finds fragments that don't answer the question
- **Too large** (> 2000 chars): Fewer chunks retrieved; relevant information may be diluted by noise
- **500 chars** is a good starting point for prose; increase to 1000–2000 for technical documentation

### Tuning Top-K

- **Too low** (1–2): May miss relevant context, especially for multi-aspect questions
- **Too high** (> 10): Adds noise and token cost; diminishing returns
- **5** is a reasonable default; increase if answers feel incomplete

## Architecture

See [architecture.md](./architecture.md) for a detailed breakdown with component diagrams.

## Related Patterns

| Pattern | When to prefer it |
|---------|-------------------|
| **01: ReAct Agent** | When you need dynamic tool use beyond retrieval |
| **08: RAG with Re-ranking** | When precision matters more than recall |
| **09: Agentic RAG** | When queries require multi-hop retrieval or query decomposition |
| **10: Hybrid Search** | When combining keyword search with semantic search improves recall |

## Further Reading

- [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401) — Original RAG paper (Lewis et al., 2020)
- [Anthropic Embeddings Documentation](https://docs.anthropic.com/en/docs/embeddings)
- [ChromaDB Documentation](https://docs.trychroma.com/)
- [Building Effective Agents (Anthropic Blog)](https://www.anthropic.com/research/building-effective-agents)
- [Advanced RAG Techniques](https://arxiv.org/abs/2312.10997) — Survey of RAG improvements
