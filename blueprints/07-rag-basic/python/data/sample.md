# AI Agents: An Overview

## What Are AI Agents?

An AI agent is an autonomous system that perceives its environment, makes decisions, and takes
actions to achieve a specified goal. Unlike traditional software that follows a fixed sequence
of instructions, an AI agent can adapt its behavior based on new information, intermediate
results, and changing conditions. Modern AI agents are typically built on top of large language
models (LLMs), which provide the reasoning and language capabilities, combined with tools that
allow the agent to interact with the external world — such as web search, code execution,
database queries, or API calls.

## Core Agent Patterns

The most widely used agent architecture is the **ReAct** (Reasoning + Acting) loop, first
described by Yao et al. in 2022. In a ReAct agent, the LLM alternates between generating
a reasoning trace ("I need to look up the current population of Tokyo") and executing an
action (calling a search tool). The result of the action is added back to the context, and
the cycle continues until the agent reaches a final answer. This interleaving of thought and
action makes the agent's decision-making transparent and debuggable.

Other important patterns include **Plan-and-Execute**, where the agent first generates a
complete plan before taking any actions (useful when actions are irreversible), and
**Multi-Agent** systems, where a supervisor agent delegates subtasks to specialized sub-agents.
Each pattern involves trade-offs between flexibility, latency, and safety.

## Retrieval-Augmented Generation

Retrieval-Augmented Generation (RAG) is a technique for grounding LLM responses in external
knowledge. Instead of relying solely on information encoded in model weights during training,
RAG systems retrieve relevant document chunks from a vector database at query time and inject
them into the prompt as context. This allows the model to answer questions about private
documents, recent events, or domain-specific knowledge that was not part of its training data.

The RAG pipeline has two phases: ingestion (chunking documents, computing embeddings, storing
in a vector store) and retrieval (embedding the query, finding similar chunks, passing them to
the LLM). The quality of a RAG system depends heavily on chunk size, embedding model quality,
and the number of retrieved chunks (top-K). Poorly chunked documents lead to fragments that
lack sufficient context; too many retrieved chunks add noise and increase token costs.

## Embeddings and Vector Search

Embeddings are dense numerical representations of text, typically vectors with hundreds or
thousands of dimensions. Semantically similar texts produce embeddings that are close together
in this high-dimensional space, as measured by cosine similarity or dot product. Embedding
models are trained to capture semantic meaning: "What is the capital of France?" and "Which
city is France's capital?" produce nearly identical embeddings even though the words differ.

Vector databases like ChromaDB, Pinecone, and Weaviate are optimized for storing and
searching these embeddings at scale. They use approximate nearest-neighbor (ANN) algorithms
such as HNSW (Hierarchical Navigable Small World) to find the top-K most similar vectors in
milliseconds, even when the database contains millions of entries. The combination of high-
quality embeddings and efficient vector search is what makes RAG systems fast enough for
interactive applications.

## Safety and Reliability Considerations

Building reliable AI agents requires careful attention to failure modes. Common issues include
tool call failures (network errors, API rate limits), infinite loops when the agent cannot
make progress, and prompt injection attacks where adversarial content in retrieved documents
attempts to hijack the agent's behavior. Production agent systems should implement retry logic
with exponential backoff, hard iteration limits, input sanitization for retrieved content,
and structured logging so that failures can be diagnosed after the fact.

Human-in-the-loop checkpoints are essential for high-stakes applications. Before executing
irreversible actions — such as sending emails, modifying databases, or making purchases —
the agent should pause and request explicit human approval. This sacrifices some autonomy for
a significant gain in safety and user trust.
