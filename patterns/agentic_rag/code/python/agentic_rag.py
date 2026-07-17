"""
Agentic RAG — hybrid retrieval with late reranking inside a reflection loop.

The retrieval core that separates this pattern from baseline RAG:
  Hybrid retrieve: dense (embedding) and sparse (keyword) search run in
                   parallel, fused with reciprocal rank fusion (RRF)
  Rerank:          a late reranker re-scores the fused candidates against
                   the question between retrieval and generation
  Reflect:         a sufficiency check decides answer vs retry with a
                   reformulated query (capped attempts)

Design doc:  ../../design.md
Overview:    ../../overview.md
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from patterns.agentic_rag.schemas.state import (  # noqa: F401
    AgenticRagState,
    EvidenceChunk,
    SubQuestion,
)

# --- Interfaces --------------------------------------------------------------
#
# Recipes targeting Agentic RAG bind to the canonical ``AgenticRagState`` /
# ``SubQuestion`` / ``EvidenceChunk`` shapes imported above (EvidenceChunk
# carries ``embedding_score`` and ``rerank_score`` for the two stages below).
# This sibling's ``Candidate`` dataclass is the in-memory retrieval container;
# an adapter pairs the two at the evidence boundary.


class LLM(Protocol):
    def generate(self, messages: list[dict]) -> str: ...


class Embedder(Protocol):
    """Convert text to a float vector. Use any embedding model."""

    def embed(self, text: str) -> list[float]: ...


class Reranker(Protocol):
    """Re-score candidates against the question with full attention.

    Replace with a hosted reranker (Cohere Rerank) or a local cross-encoder
    to ship; the keyword-overlap mock in the demo keeps this file offline.
    """

    def rerank(self, question: str, candidates: list[Candidate], top_n: int) -> list[Candidate]: ...


# --- Core types ---------------------------------------------------------------


@dataclass
class Candidate:
    id: str
    text: str
    dense_score: float = 0.0
    sparse_score: float = 0.0
    fused_score: float = 0.0
    rerank_score: float = 0.0
    metadata: dict = field(default_factory=dict)


@dataclass
class AgenticRAGResult:
    answer: str
    evidence: list[Candidate] = field(default_factory=list)
    attempts: int = 1
    grounded: bool = True


# --- In-memory hybrid index ----------------------------------------------------


class HybridIndex:
    """Dense dot-product plus keyword-overlap search over one corpus.

    Replace with a store that runs both retrievals natively to ship —
    Qdrant hybrid queries, or pgvector alongside Postgres full-text search.
    """

    def __init__(self) -> None:
        self._items: list[tuple[str, list[float], str, dict]] = []

    def add(self, id: str, embedding: list[float], text: str, metadata: dict) -> None:
        self._items.append((id, embedding, text, metadata))

    def dense_search(self, embedding: list[float], top_k: int) -> list[Candidate]:
        def dot(a: list[float], b: list[float]) -> float:
            return sum(x * y for x, y in zip(a, b, strict=False))

        scored = [
            Candidate(id=id_, text=text, dense_score=dot(embedding, emb), metadata=meta)
            for id_, emb, text, meta in self._items
        ]
        scored.sort(key=lambda c: c.dense_score, reverse=True)
        return scored[:top_k]

    def sparse_search(self, query: str, top_k: int) -> list[Candidate]:
        terms = {t for t in query.lower().split() if len(t) > 2}
        scored = []
        for id_, _emb, text, meta in self._items:
            words = set(text.lower().split())
            overlap = len(terms & words) / len(terms) if terms else 0.0
            scored.append(Candidate(id=id_, text=text, sparse_score=overlap, metadata=meta))
        scored.sort(key=lambda c: c.sparse_score, reverse=True)
        return scored[:top_k]


def reciprocal_rank_fusion(dense: list[Candidate], sparse: list[Candidate], k: int = 60) -> list[Candidate]:
    """Fuse two ranked lists by summed reciprocal rank — no score calibration
    needed, which is why RRF is the default fusion for hybrid retrieval."""
    fused: dict[str, Candidate] = {}
    for ranked in (dense, sparse):
        for rank, cand in enumerate(ranked):
            slot = fused.setdefault(cand.id, cand)
            slot.fused_score += 1.0 / (k + rank + 1)
            if cand.dense_score:
                slot.dense_score = cand.dense_score
            if cand.sparse_score:
                slot.sparse_score = cand.sparse_score
    return sorted(fused.values(), key=lambda c: c.fused_score, reverse=True)


# --- Pipeline -------------------------------------------------------------------

ANSWER_PROMPT = """\
Answer the question using only the numbered sources. Cite the source number
for every claim. If the sources do not contain the answer, say so plainly.

Sources:
{context}

Question: {question}"""


class AgenticRAGPipeline:
    """Hybrid retrieve, rerank, reflect, then generate with citations.

    Ingestion: call pipeline.ingest(documents) once (or incrementally).
    Query:     call pipeline.query(question) at request time.
    """

    def __init__(
        self,
        llm: LLM,
        embedder: Embedder,
        reranker: Reranker,
        index: HybridIndex | None = None,
        retrieve_k: int = 8,
        rerank_n: int = 3,
        max_attempts: int = 2,
        sufficiency_threshold: float = 0.3,
    ):
        self.llm = llm
        self.embedder = embedder
        self.reranker = reranker
        self.index = index or HybridIndex()
        self.retrieve_k = retrieve_k
        self.rerank_n = rerank_n
        self.max_attempts = max_attempts
        self.sufficiency_threshold = sufficiency_threshold

    def ingest(self, documents: list[str], metadata: list[dict] | None = None) -> int:
        metadata = metadata or [{}] * len(documents)
        for i, (doc, meta) in enumerate(zip(documents, metadata, strict=False)):
            self.index.add(f"doc_{i}", self.embedder.embed(doc), doc, meta)
        return len(documents)

    def query(self, question: str) -> AgenticRAGResult:
        current = question
        evidence: list[Candidate] = []
        for attempt in range(1, self.max_attempts + 1):
            dense = self.index.dense_search(self.embedder.embed(current), self.retrieve_k)
            sparse = self.index.sparse_search(current, self.retrieve_k)
            fused = reciprocal_rank_fusion(dense, sparse)
            evidence = self.reranker.rerank(question, fused, self.rerank_n)
            if self._sufficient(evidence) or attempt == self.max_attempts:
                return self._compose(question, evidence, attempt)
            # Insufficient evidence: reformulate and retry. A production loop
            # asks the sufficiency reflector (prompts/sufficiency-reflector.md)
            # what is missing; the demo widens the query mechanically.
            current = f"{question} background definition details"
        return self._compose(question, evidence, self.max_attempts)

    def _sufficient(self, evidence: list[Candidate]) -> bool:
        return bool(evidence) and evidence[0].rerank_score >= self.sufficiency_threshold

    def _compose(self, question: str, evidence: list[Candidate], attempts: int) -> AgenticRAGResult:
        context = "\n\n".join(f"[{i + 1}] {c.text}" for i, c in enumerate(evidence))
        answer = self.llm.generate(
            [{"role": "user", "content": ANSWER_PROMPT.format(context=context, question=question)}]
        )
        return AgenticRAGResult(
            answer=answer,
            evidence=evidence,
            attempts=attempts,
            grounded=self._sufficient(evidence),
        )


# --- Example ---------------------------------------------------------------------

if __name__ == "__main__":
    import hashlib

    class MockEmbedder:
        """Deterministic fake embeddings based on text hash."""

        def embed(self, text: str) -> list[float]:
            h = int(hashlib.md5(text.encode()).hexdigest(), 16)
            return [(h >> i & 0xFF) / 255.0 for i in range(8)]

    class KeywordOverlapReranker:
        """Offline stand-in for a cross-encoder: question-term overlap."""

        def rerank(self, question: str, candidates: list[Candidate], top_n: int) -> list[Candidate]:
            terms = {t for t in question.lower().split() if len(t) > 2}
            for c in candidates:
                words = set(c.text.lower().split())
                c.rerank_score = len(terms & words) / len(terms) if terms else 0.0
            return sorted(candidates, key=lambda c: c.rerank_score, reverse=True)[:top_n]

    class MockLLM:
        def generate(self, messages: list[dict]) -> str:
            return f"Grounded answer from: {messages[-1]['content'][:80]}..."

    pipeline = AgenticRAGPipeline(
        llm=MockLLM(),
        embedder=MockEmbedder(),
        reranker=KeywordOverlapReranker(),
    )
    n = pipeline.ingest(
        [
            "ReAct is a prompting technique that combines chain-of-thought reasoning with action execution.",
            "RAG stands for Retrieval-Augmented Generation. It retrieves relevant documents before generating.",
            "Hybrid retrieval fuses dense embedding search with sparse keyword search using reciprocal rank fusion.",
            "A reranker re-scores retrieved candidates against the question before the model sees them.",
        ]
    )
    print(f"Ingested {n} documents")

    result = pipeline.query("How does hybrid retrieval with reranking work?")
    print(f"Evidence: {len(result.evidence)} chunks after {result.attempts} attempt(s)")
    for i, c in enumerate(result.evidence):
        print(f"  [{i + 1}] fused={c.fused_score:.4f} rerank={c.rerank_score:.2f} {c.text[:60]}")
    print(f"Answer: {result.answer[:120]}")
