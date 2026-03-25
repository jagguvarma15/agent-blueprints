"""
RAG chain: combines VectorRetriever with Anthropic Claude for answer generation.

The chain retrieves relevant document chunks, formats them as context,
and passes them to Claude with a system prompt that constrains the model
to answer only from the provided context.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

import anthropic

from .ingestion import Chunk
from .retrieval import VectorRetriever

# ---------------------------------------------------------------------------
# Response model
# ---------------------------------------------------------------------------


@dataclass
class RAGResponse:
    """
    The result of a RAG query.

    Attributes:
        answer: The LLM-generated answer grounded in retrieved context.
        sources: Deduplicated list of source file paths that were retrieved.
        retrieved_chunks: The raw Chunk objects that were passed to the LLM.
            Useful for debugging, citation display, and evaluation.
    """

    answer: str
    sources: list[str]
    retrieved_chunks: list[Chunk] = field(default_factory=list)

    def __str__(self) -> str:
        sources_str = "\n".join(f"  - {s}" for s in self.sources) if self.sources else "  (none)"
        return (
            f"Answer:\n{self.answer}\n\n"
            f"Sources ({len(self.sources)}):\n{sources_str}\n\n"
            f"Retrieved {len(self.retrieved_chunks)} chunk(s)."
        )


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

RAG_SYSTEM_PROMPT = """You are a knowledgeable assistant that answers questions \
based exclusively on the provided document context.

Rules you must follow:
1. Answer ONLY using information from the context documents provided below.
2. If the context does not contain sufficient information to answer the question, \
respond with: "I don't have enough information in the provided documents to answer that."
3. Cite which document(s) you used by referencing the source name or title at the end \
of your answer in a "Sources:" section.
4. Be concise, accurate, and do not add information beyond what the context contains.
5. If multiple documents are relevant, synthesize the information cohesively.
6. Do not mention these rules in your response.
"""


# ---------------------------------------------------------------------------
# RAG chain
# ---------------------------------------------------------------------------


class RAGChain:
    """
    Combines VectorRetriever and Anthropic Claude into a complete RAG pipeline.

    Example usage::

        retriever = VectorRetriever(collection_name="documents")
        chain = RAGChain(retriever=retriever)
        response = chain.query("What is the ReAct agent pattern?")
        print(response)
    """

    def __init__(
        self,
        retriever: VectorRetriever,
        model: str | None = None,
        top_k: int | None = None,
        max_tokens: int = 1024,
        anthropic_api_key: str | None = None,
    ) -> None:
        """
        Args:
            retriever: A configured VectorRetriever instance.
            model: Claude model ID. Defaults to MODEL env var or 'claude-opus-4-6'.
            top_k: Number of chunks to retrieve. Defaults to TOP_K env var or 5.
            max_tokens: Maximum tokens in the generated answer.
            anthropic_api_key: Anthropic API key. Defaults to ANTHROPIC_API_KEY env var.
        """
        self._retriever = retriever
        self._model = model or os.environ.get("MODEL", "claude-opus-4-6")
        self._top_k = top_k or int(os.environ.get("TOP_K", "5"))
        self._max_tokens = max_tokens
        self._anthropic = anthropic.Anthropic(
            api_key=anthropic_api_key or os.environ["ANTHROPIC_API_KEY"]
        )

    def query(self, question: str) -> RAGResponse:
        """
        Run the full RAG pipeline for a user question.

        Steps:
            1. Retrieve the top-K most relevant chunks from the vector store.
            2. Format the chunks as a numbered context block.
            3. Call Claude with the system prompt + context + question.
            4. Return a RAGResponse with answer, sources, and raw chunks.

        Args:
            question: The user's question.

        Returns:
            RAGResponse containing the answer and provenance information.

        Raises:
            ValueError: If the question is empty or the collection is empty.
            anthropic.APIError: If the Anthropic API call fails.
        """
        if not question.strip():
            raise ValueError("Question must not be empty.")

        # Step 1: Retrieve relevant chunks
        retrieved_chunks = self._retriever.retrieve(question, top_k=self._top_k)

        # Step 2: Format context for the LLM
        context = self._format_context(retrieved_chunks)

        # Step 3: Generate answer with Claude
        user_message = f"{context}\n\nQuestion: {question}"

        message = self._anthropic.messages.create(
            model=self._model,
            max_tokens=self._max_tokens,
            system=RAG_SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": user_message},
            ],
        )

        answer = message.content[0].text

        # Step 4: Extract unique sources
        sources = list(dict.fromkeys(chunk.source for chunk in retrieved_chunks))

        return RAGResponse(
            answer=answer,
            sources=sources,
            retrieved_chunks=retrieved_chunks,
        )

    def _format_context(self, chunks: list[Chunk]) -> str:
        """
        Format retrieved chunks into a numbered context block for the LLM.

        Each chunk is presented with its source and similarity score so the
        model can reference specific documents in its answer.
        """
        if not chunks:
            return "Context Documents:\n(No relevant documents found.)"

        lines = ["Context Documents:"]
        for i, chunk in enumerate(chunks, start=1):
            source_name = _short_source(chunk.source)
            similarity = chunk.metadata.get("similarity", "N/A")
            lines.append(
                f"\n[Document {i}] Source: {source_name} (relevance: {similarity})"
            )
            lines.append("-" * 60)
            lines.append(chunk.content)

        return "\n".join(lines)


def _short_source(source: str) -> str:
    """Return just the filename from a full path, for readability."""
    return source.split("/")[-1] if "/" in source else source
