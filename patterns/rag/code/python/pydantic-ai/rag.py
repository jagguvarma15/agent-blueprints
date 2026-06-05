"""
RAG — Pydantic AI variant.

Pattern: RAG (chunk + embed + retrieve, then generate a grounded answer).
Framework: Pydantic AI (>=0.1.0).
Idioms: an Agent[Deps, RAGAnswer] declares a typed result schema; a single
  @agent.tool that does the retrieval is wired via RunContext[Deps] so the
  vector store + embedder come from typed dependencies, not module globals.
  agent.run_sync() drives the loop; the framework owns retries on validation.
Design doc: ../../../design.md (the framework-agnostic ../../python/rag.py
  walks the chunk → embed → store → retrieve → generate cycle without a real
  framework so the contract is visible).

Install:  uv add 'pydantic-ai[anthropic]'
Run:      ANTHROPIC_API_KEY=... uv run --with 'pydantic-ai[anthropic]' rag.py

This variant treats retrieval as a tool the agent calls; the alternative
(retrieve outside the agent and inline the context into the system prompt)
is what the Vercel AI SDK sibling at
../../typescript/vercel-ai-sdk/rag.ts demonstrates.
"""

from __future__ import annotations

import hashlib
import os
import sys
from dataclasses import dataclass, field
from typing import Annotated

from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext

_SEED_DOCUMENTS: list[str] = [
    "ReAct is a prompting technique that combines chain-of-thought reasoning with action execution.",
    "RAG stands for Retrieval-Augmented Generation. It retrieves relevant documents before generating.",
    "Plan and Execute separates planning from execution. The planner creates a full plan upfront.",
]


def _embed(text: str) -> list[float]:
    """Deterministic 8-dim mock vector matching the python sibling's MockEmbedder."""
    h = int(hashlib.md5(text.encode()).hexdigest(), 16)
    return [(h >> (i * 8) & 0xFF) / 255.0 for i in range(8)]


def _dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=False))


@dataclass
class VectorStore:
    """Tiny in-memory store. Replace with Qdrant / Pinecone / Chroma to ship."""

    items: list[tuple[str, list[float], str]] = field(default_factory=list)

    def add(self, doc_id: str, text: str) -> None:
        self.items.append((doc_id, _embed(text), text))

    def search(self, query: str, top_k: int = 2) -> list[tuple[str, float, str]]:
        q = _embed(query)
        scored = [(doc_id, _dot(q, emb), text) for doc_id, emb, text in self.items]
        scored.sort(key=lambda row: row[1], reverse=True)
        return scored[:top_k]


@dataclass
class RAGDeps:
    """Typed deps Pydantic AI injects into each tool call."""

    store: VectorStore


class Citation(BaseModel):
    doc_id: str
    score: float


class RAGAnswer(BaseModel):
    """Result type — Pydantic AI validates the LLM's output against this."""

    answer: str = Field(description="Grounded answer derived from the retrieved chunks.")
    citations: list[Citation] = Field(default_factory=list)


agent = Agent[RAGDeps, RAGAnswer](
    "anthropic:claude-haiku-4-5",
    deps_type=RAGDeps,
    output_type=RAGAnswer,
    system_prompt=(
        "You answer questions using only the context returned by the "
        "retrieve_context tool. If retrieval returns no useful context, "
        "say so plainly instead of guessing. Cite every chunk you use."
    ),
)


@agent.tool
def retrieve_context(
    ctx: RunContext[RAGDeps],
    query: Annotated[str, "What to search the corpus for."],
) -> str:
    """Return the top-k chunks for `query` as a single text block."""
    hits = ctx.deps.store.search(query, top_k=2)
    if not hits:
        return "(no relevant context)"
    return "\n\n---\n\n".join(
        f"[{doc_id} score={score:.2f}] {text}" for doc_id, score, text in hits
    )


def main() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the real model.", file=sys.stderr)
        return

    store = VectorStore()
    for i, doc in enumerate(_SEED_DOCUMENTS):
        store.add(f"doc_{i}", doc)

    result = agent.run_sync(
        "What is RAG and how does it work?",
        deps=RAGDeps(store=store),
    )
    print(f"answer: {result.output.answer[:200]}")
    for cite in result.output.citations:
        print(f"  cite: {cite.doc_id} (score {cite.score:.2f})")


if __name__ == "__main__":
    main()
