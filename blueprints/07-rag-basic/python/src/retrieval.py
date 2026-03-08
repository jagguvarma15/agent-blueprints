"""
Vector retrieval for the RAG Basic blueprint.

Embeds a query using the same model used during ingestion, performs a
cosine-similarity search in ChromaDB, and returns hydrated Chunk objects
with similarity scores.
"""

from __future__ import annotations

import os
from typing import Any

import anthropic
import chromadb

from .ingestion import Chunk


class VectorRetriever:
    """
    Retrieves the most relevant document chunks for a given query.

    Uses Anthropic's voyage-3 embedding model for query embedding and
    ChromaDB for approximate nearest-neighbor search.

    Example usage::

        retriever = VectorRetriever(collection_name="documents")
        chunks = retriever.retrieve("What is retrieval-augmented generation?", top_k=5)
        for chunk in chunks:
            print(f"[{chunk.metadata['similarity']:.3f}] {chunk.source}")
            print(chunk.content[:200])
    """

    def __init__(
        self,
        collection_name: str = "documents",
        chroma_host: str | None = None,
        chroma_port: int | None = None,
        anthropic_api_key: str | None = None,
    ) -> None:
        """
        Args:
            collection_name: Name of the ChromaDB collection to search.
            chroma_host: ChromaDB server host. Defaults to CHROMA_HOST env var or 'localhost'.
            chroma_port: ChromaDB server port. Defaults to CHROMA_PORT env var or 8000.
            anthropic_api_key: Anthropic API key. Defaults to ANTHROPIC_API_KEY env var.
        """
        host = chroma_host or os.environ.get("CHROMA_HOST", "localhost")
        port = chroma_port or int(os.environ.get("CHROMA_PORT", "8000"))

        self._anthropic = anthropic.Anthropic(
            api_key=anthropic_api_key or os.environ["ANTHROPIC_API_KEY"]
        )
        self._chroma = chromadb.HttpClient(host=host, port=port)
        self._collection_name = collection_name
        self._collection = self._chroma.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def retrieve(self, query: str, top_k: int = 5) -> list[Chunk]:
        """
        Embed the query and return the top-K most similar chunks.

        Args:
            query: The user's question or search string.
            top_k: Number of chunks to return. More chunks provide more context
                   but increase token cost and may introduce noise.

        Returns:
            List of Chunk objects sorted by descending similarity score.
            Each chunk's ``metadata`` dict contains a ``similarity`` key with
            the cosine similarity score in [0, 1].

        Raises:
            ValueError: If the collection is empty.
            anthropic.APIError: If the embedding API call fails.
        """
        if not query.strip():
            raise ValueError("Query must not be empty.")

        # Check collection has documents
        count = self._collection.count()
        if count == 0:
            raise ValueError(
                f"Collection '{self._collection_name}' is empty. "
                "Run ingestion before querying."
            )

        # Clamp top_k to number of available documents
        effective_top_k = min(top_k, count)

        # Embed the query using the same model as ingestion
        response = self._anthropic.embeddings.create(
            model="voyage-3",
            input=[query],
        )
        query_embedding = response.data[0].embedding

        # Perform vector similarity search in ChromaDB
        results = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=effective_top_k,
            include=["documents", "metadatas", "distances"],
        )

        # ChromaDB returns lists-of-lists (one per query); we only have one query
        ids: list[str] = results["ids"][0]
        documents: list[str] = results["documents"][0]
        metadatas: list[dict[str, Any]] = [dict(m) for m in (results["metadatas"][0] or [])]
        # ChromaDB cosine space returns distances where distance = 1 - similarity
        distances: list[float] = results["distances"][0]

        chunks: list[Chunk] = []
        for chunk_id, content, metadata, distance in zip(
            ids, documents, metadatas, distances, strict=False
        ):
            # Convert distance to similarity score for readability
            similarity = 1.0 - distance
            chunk = Chunk(
                id=chunk_id,
                content=content,
                source=metadata.get("source", "unknown"),
                metadata={
                    **metadata,
                    "similarity": round(similarity, 4),
                },
            )
            chunks.append(chunk)

        return chunks

    def get_collection_stats(self) -> dict:
        """Return basic statistics about the collection."""
        count = self._collection.count()
        return {
            "collection_name": self._collection_name,
            "total_chunks": count,
        }
