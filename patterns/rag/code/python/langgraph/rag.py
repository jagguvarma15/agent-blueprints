"""
RAG — LangGraph variant.

Pattern: RAG (chunk + embed + retrieve, then generate a grounded answer).
Framework: LangGraph (>=0.3.21) with langchain-anthropic for the model.
Idioms: an explicit StateGraph with two nodes — retrieve and generate. State
  is a TypedDict that accumulates the question, retrieved chunks, and the
  final answer. Conditional edges let you extend the graph (e.g. add a
  re-retrieve loop) without rewriting the contract.
Design doc: ../../../design.md (the framework-agnostic ../../python/rag.py
  shows the chunk/embed/retrieve/generate flow without a real framework).

Install:  uv add langgraph langchain-anthropic langchain-core
Run:      ANTHROPIC_API_KEY=... uv run --with langgraph \
              --with langchain-anthropic rag.py

The LangGraph primitive here is the explicit state graph: retrieve and
generate are separate nodes, and the edge between them is the contract.
Reach for this shape when retrieval needs to be conditional, retryable,
or fan-out to multiple stores. For the linear "retrieve once, generate"
case (like this smoke), the Pydantic AI sibling at ../pydantic-ai/rag.py
is leaner.
"""

from __future__ import annotations

import hashlib
import os
import sys
from typing import TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph

# LangGraph wants a TypedDict state shape, so this adapter inlines
# ``RAGState`` below with field names that mirror the canonical
# :class:`patterns.rag.schemas.state.RagState` (``question``,
# ``documents``, ``chunks``, ``answer``) — the import documents the
# contract recipes still bind to.
from patterns.rag.schemas.state import Answer, Query, RagState, RetrievedDoc  # noqa: F401

_SEED_DOCUMENTS: list[str] = [
    "ReAct is a prompting technique that combines chain-of-thought reasoning with action execution.",
    "RAG stands for Retrieval-Augmented Generation. It retrieves relevant documents before generating.",
    "Plan and Execute separates planning from execution. The planner creates a full plan upfront.",
]


def _embed(text: str) -> list[float]:
    """Deterministic 8-dim mock vector (matches the python sibling's MockEmbedder)."""
    h = int(hashlib.md5(text.encode()).hexdigest(), 16)
    return [(h >> (i * 8) & 0xFF) / 255.0 for i in range(8)]


def _dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=False))


class _Chunk(TypedDict):
    doc_id: str
    text: str
    score: float


class RAGState(TypedDict):
    """The state dict that flows through every node."""

    question: str
    documents: list[str]
    chunks: list[_Chunk]
    answer: str


def retrieve(state: RAGState) -> RAGState:
    """Compute the top-k chunks for the state's question."""
    q_vec = _embed(state["question"])
    scored: list[_Chunk] = []
    for i, doc in enumerate(state["documents"]):
        score = _dot(q_vec, _embed(doc))
        scored.append({"doc_id": f"doc_{i}", "text": doc, "score": score})
    scored.sort(key=lambda c: c["score"], reverse=True)
    return {**state, "chunks": scored[:2]}


def generate(state: RAGState) -> RAGState:
    """Inline the retrieved chunks into the prompt and call the model."""
    model = ChatAnthropic(model="claude-haiku-4-5", temperature=0)
    context = "\n\n---\n\n".join(
        f"[{c['doc_id']} score={c['score']:.2f}] {c['text']}" for c in state["chunks"]
    )
    response = model.invoke(
        [
            SystemMessage(
                content=(
                    "You answer questions using only the provided context. "
                    "If the context does not contain enough information, say so plainly."
                ),
            ),
            HumanMessage(
                content=f"Context:\n{context}\n\nQuestion: {state['question']}",
            ),
        ],
    )
    return {**state, "answer": str(response.content)}


def build_graph() -> object:
    """Wire retrieve → generate. Compiled graph is invokable via .invoke(state)."""
    graph = StateGraph(RAGState)
    graph.add_node("retrieve", retrieve)
    graph.add_node("generate", generate)
    graph.add_edge(START, "retrieve")
    graph.add_edge("retrieve", "generate")
    graph.add_edge("generate", END)
    return graph.compile()


def main() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the real model.", file=sys.stderr)
        # Still exercise the retrieve node so the wiring is visible offline.
        retrieved = retrieve(
            {"question": "What is RAG?", "documents": _SEED_DOCUMENTS, "chunks": [], "answer": ""},
        )
        print(f"offline retrieve produced {len(retrieved['chunks'])} chunks")
        return

    compiled = build_graph()
    final_state: RAGState = compiled.invoke(  # type: ignore[assignment, attr-defined]
        {
            "question": "What is RAG and how does it work?",
            "documents": _SEED_DOCUMENTS,
            "chunks": [],
            "answer": "",
        },
    )
    print(f"answer: {final_state['answer'][:200]}")
    print(f"chunks: {len(final_state['chunks'])}")
    for c in final_state["chunks"]:
        print(f"  {c['doc_id']} (score {c['score']:.2f})")


if __name__ == "__main__":
    main()
