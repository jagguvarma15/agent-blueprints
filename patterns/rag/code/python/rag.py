"""
RAG (Retrieval-Augmented Generation) — Retrieve relevant context, then generate.

Two phases:
  Ingestion (offline): chunk documents → embed → store in vector store
  Query (online):      embed query → retrieve top-k chunks → generate answer

Design doc:  ../../design.md
Overview:    ../../overview.md
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


# ── Interfaces ────────────────────────────────────────────────────────────────

class LLM(Protocol):
    def generate(self, messages: list[dict]) -> str: ...


class Embedder(Protocol):
    """Convert text to a float vector. Use any embedding model."""
    def embed(self, text: str) -> list[float]: ...


class VectorStore(Protocol):
    """Minimal vector store interface."""
    def add(self, id: str, embedding: list[float], text: str, metadata: dict) -> None: ...
    def search(self, embedding: list[float], top_k: int) -> list["Chunk"]: ...


# ── Core types ────────────────────────────────────────────────────────────────

@dataclass
class Chunk:
    id: str
    text: str
    score: float = 0.0
    metadata: dict = field(default_factory=dict)


@dataclass
class RAGResult:
    answer: str
    chunks_used: list[Chunk] = field(default_factory=list)
    query: str = ""


# ── In-memory vector store (for testing) ─────────────────────────────────────

class InMemoryVectorStore:
    """
    Simple dot-product similarity store.
    Replace with Chroma, Pinecone, Weaviate, etc. in production.
    """

    def __init__(self):
        self._items: list[tuple[str, list[float], str, dict]] = []

    def add(self, id: str, embedding: list[float], text: str, metadata: dict) -> None:
        self._items.append((id, embedding, text, metadata))

    def search(self, embedding: list[float], top_k: int) -> list[Chunk]:
        def dot(a: list[float], b: list[float]) -> float:
            return sum(x * y for x, y in zip(a, b))

        scored = [
            Chunk(id=id_, text=text, score=dot(embedding, emb), metadata=meta)
            for id_, emb, text, meta in self._items
        ]
        scored.sort(key=lambda c: c.score, reverse=True)
        return scored[:top_k]


# ── RAG pipeline ──────────────────────────────────────────────────────────────

ANSWER_PROMPT = """\
Answer the question using only the provided context. If the context does not
contain enough information, say so clearly.

Context:
{context}

Question: {question}"""


class RAGPipeline:
    """
    Retrieval-Augmented Generation pipeline.

    Ingestion: call pipeline.ingest(documents) once (or incrementally).
    Query:     call pipeline.query(question) at request time.
    """

    def __init__(
        self,
        llm: LLM,
        embedder: Embedder,
        vector_store: VectorStore | None = None,
        top_k: int = 3,
        chunk_size: int = 500,
        chunk_overlap: int = 50,
        system: str = "",
    ):
        self.llm = llm
        self.embedder = embedder
        self.store = vector_store or InMemoryVectorStore()
        self.top_k = top_k
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.system = system
        self._chunk_counter = 0

    def _split(self, text: str) -> list[str]:
        """Split text into overlapping chunks."""
        chunks: list[str] = []
        start = 0
        while start < len(text):
            end = start + self.chunk_size
            chunks.append(text[start:end].strip())
            start += self.chunk_size - self.chunk_overlap
        return [c for c in chunks if c]

    def ingest(self, documents: list[str], metadata: list[dict] | None = None) -> int:
        """
        Chunk, embed, and store documents.
        Returns the number of chunks added.
        """
        metadata = metadata or [{}] * len(documents)
        added = 0
        for doc, meta in zip(documents, metadata):
            for chunk_text in self._split(doc):
                chunk_id = f"chunk_{self._chunk_counter}"
                self._chunk_counter += 1
                embedding = self.embedder.embed(chunk_text)
                self.store.add(chunk_id, embedding, chunk_text, meta)
                added += 1
        return added

    def query(self, question: str) -> RAGResult:
        # Embed the question and retrieve relevant chunks
        q_embedding = self.embedder.embed(question)
        chunks = self.store.search(q_embedding, top_k=self.top_k)

        # Build context from retrieved chunks
        context = "\n\n---\n\n".join(
            f"[Source {i + 1}]\n{chunk.text}" for i, chunk in enumerate(chunks)
        )

        # Generate grounded answer
        messages: list[dict] = []
        if self.system:
            messages.append({"role": "system", "content": self.system})
        messages.append({
            "role": "user",
            "content": ANSWER_PROMPT.format(context=context, question=question),
        })

        answer = self.llm.generate(messages)
        return RAGResult(answer=answer, chunks_used=chunks, query=question)


# ── Example ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import hashlib

    class MockEmbedder:
        """Deterministic fake embeddings based on text hash."""
        def embed(self, text: str) -> list[float]:
            h = int(hashlib.md5(text.encode()).hexdigest(), 16)
            return [(h >> i & 0xFF) / 255.0 for i in range(8)]

    class MockLLM:
        def generate(self, messages: list[dict]) -> str:
            return f"Based on the context: {messages[-1]['content'][:80]}..."

    pipeline = RAGPipeline(
        llm=MockLLM(),
        embedder=MockEmbedder(),
        top_k=2,
        chunk_size=200,
    )

    # Ingest documents
    n = pipeline.ingest([
        "ReAct is a prompting technique that combines chain-of-thought reasoning with action execution.",
        "RAG stands for Retrieval-Augmented Generation. It retrieves relevant documents before generating.",
        "Plan and Execute separates planning from execution. The planner creates a full plan upfront.",
    ])
    print(f"Ingested {n} chunks")

    # Query
    result = pipeline.query("What is RAG and how does it work?")
    print(f"Retrieved {len(result.chunks_used)} chunks")
    print(f"Answer: {result.answer[:120]}")
