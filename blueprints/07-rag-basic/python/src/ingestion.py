"""
Document ingestion pipeline for RAG Basic blueprint.

Handles loading documents from disk, splitting them into chunks,
generating embeddings via Anthropic's API, and storing them in ChromaDB.
"""

from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

import anthropic
import chromadb


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class Document:
    """A raw document loaded from disk before chunking."""

    id: str
    content: str
    source: str  # Absolute file path or URL
    metadata: dict = field(default_factory=dict)

    @classmethod
    def from_file(cls, path: Path) -> "Document":
        """Load a Document from a file on disk."""
        content = path.read_text(encoding="utf-8")
        source = str(path.resolve())
        doc_id = hashlib.sha256(source.encode()).hexdigest()[:16]
        return cls(
            id=doc_id,
            content=content,
            source=source,
            metadata={
                "title": path.stem,
                "file_type": path.suffix.lstrip("."),
                "char_count": len(content),
                "file_name": path.name,
            },
        )


@dataclass
class Chunk:
    """A sub-section of a Document ready for embedding and storage."""

    id: str
    content: str
    source: str  # Inherited from parent Document
    metadata: dict = field(default_factory=dict)
    embedding: list[float] | None = field(default=None, repr=False)


# ---------------------------------------------------------------------------
# Ingestion pipeline
# ---------------------------------------------------------------------------


class DocumentIngester:
    """
    Orchestrates the ingestion pipeline:

        Documents → Chunks → Embeddings → ChromaDB

    Example usage::

        ingester = DocumentIngester()
        docs = ingester.load_documents("data/")
        chunks = ingester.chunk_documents(docs, chunk_size=500, overlap=50)
        ingester.embed_and_store(chunks, collection_name="documents")
    """

    SUPPORTED_EXTENSIONS = {".txt", ".md"}

    def __init__(
        self,
        anthropic_api_key: str | None = None,
        chroma_host: str = "localhost",
        chroma_port: int = 8000,
    ) -> None:
        self._anthropic = anthropic.Anthropic(
            api_key=anthropic_api_key or os.environ["ANTHROPIC_API_KEY"]
        )
        self._chroma = chromadb.HttpClient(host=chroma_host, port=chroma_port)

    # ------------------------------------------------------------------
    # Step 1: Load
    # ------------------------------------------------------------------

    def load_documents(self, path: str) -> list[Document]:
        """
        Recursively load all supported documents from a file or directory.

        Args:
            path: Path to a file or directory.

        Returns:
            List of Document objects.

        Raises:
            FileNotFoundError: If ``path`` does not exist.
            ValueError: If no supported files are found.
        """
        root = Path(path).resolve()
        if not root.exists():
            raise FileNotFoundError(f"Path does not exist: {root}")

        if root.is_file():
            files = [root] if root.suffix in self.SUPPORTED_EXTENSIONS else []
        else:
            files = [
                f
                for f in root.rglob("*")
                if f.is_file() and f.suffix in self.SUPPORTED_EXTENSIONS
            ]

        if not files:
            raise ValueError(
                f"No supported files found at {root}. "
                f"Supported extensions: {self.SUPPORTED_EXTENSIONS}"
            )

        documents = []
        for file_path in sorted(files):
            try:
                doc = Document.from_file(file_path)
                documents.append(doc)
                print(f"  Loaded: {file_path.name} ({doc.metadata['char_count']:,} chars)")
            except Exception as exc:  # noqa: BLE001
                print(f"  Warning: Could not load {file_path}: {exc}")

        print(f"Loaded {len(documents)} document(s).")
        return documents

    # ------------------------------------------------------------------
    # Step 2: Chunk
    # ------------------------------------------------------------------

    def chunk_documents(
        self,
        docs: list[Document],
        chunk_size: int = 500,
        overlap: int = 50,
    ) -> list[Chunk]:
        """
        Split documents into overlapping chunks using a sliding window.

        Chunks are split on sentence/paragraph boundaries where possible to
        avoid cutting mid-sentence. When a natural boundary is not available
        within ``chunk_size`` characters, a hard split is performed.

        Args:
            docs: Documents to chunk.
            chunk_size: Target size of each chunk in characters.
            overlap: Number of characters to overlap between adjacent chunks.
                     Overlap preserves context at chunk boundaries.

        Returns:
            List of Chunk objects with positional metadata.
        """
        if chunk_size <= 0:
            raise ValueError(f"chunk_size must be positive, got {chunk_size}")
        if overlap < 0:
            raise ValueError(f"overlap must be non-negative, got {overlap}")
        if overlap >= chunk_size:
            raise ValueError(
                f"overlap ({overlap}) must be less than chunk_size ({chunk_size})"
            )

        all_chunks: list[Chunk] = []

        for doc in docs:
            chunks = self._split_text(doc.content, chunk_size, overlap)
            total = len(chunks)

            for idx, (text, char_start, char_end) in enumerate(chunks):
                chunk = Chunk(
                    id=f"{doc.id}_chunk_{idx:04d}",
                    content=text,
                    source=doc.source,
                    metadata={
                        **doc.metadata,
                        "chunk_index": idx,
                        "total_chunks": total,
                        "char_start": char_start,
                        "char_end": char_end,
                    },
                )
                all_chunks.append(chunk)

        print(
            f"Created {len(all_chunks)} chunk(s) from {len(docs)} document(s) "
            f"(chunk_size={chunk_size}, overlap={overlap})."
        )
        return all_chunks

    def _split_text(
        self, text: str, chunk_size: int, overlap: int
    ) -> list[tuple[str, int, int]]:
        """
        Split text into (chunk_text, char_start, char_end) tuples.

        Uses a sliding window approach, preferring to split at paragraph or
        sentence boundaries to preserve readability.
        """
        if not text.strip():
            return []

        chunks: list[tuple[str, int, int]] = []
        step = chunk_size - overlap
        start = 0

        while start < len(text):
            end = min(start + chunk_size, len(text))

            # Try to find a natural break near the end of this window
            if end < len(text):
                # Prefer paragraph break (double newline)
                break_pos = self._find_break(text, start, end, prefer_paragraph=True)
                if break_pos is not None:
                    end = break_pos

            chunk_text = text[start:end].strip()
            if chunk_text:
                chunks.append((chunk_text, start, end))

            # Advance by step (chunk_size - overlap)
            start += step

            # If we've reached the end, stop
            if end >= len(text):
                break

        return chunks

    def _find_break(
        self, text: str, start: int, end: int, prefer_paragraph: bool = True
    ) -> int | None:
        """
        Find the best split position within [start, end].

        Searches backwards from ``end`` for a paragraph break, then a sentence
        break, then any whitespace. Returns None if no suitable break is found.
        """
        search_window = text[start:end]

        if prefer_paragraph:
            # Look for double newline (paragraph break)
            match = None
            for m in re.finditer(r"\n\n+", search_window):
                match = m
            if match:
                return start + match.end()

        # Look for sentence-ending punctuation followed by whitespace
        match = None
        for m in re.finditer(r"[.!?]\s+", search_window):
            match = m
        if match:
            return start + match.end()

        # Fall back to any whitespace near the end
        rev_text = search_window[::-1]
        ws_match = re.search(r"\s", rev_text)
        if ws_match:
            return end - ws_match.start()

        return None

    # ------------------------------------------------------------------
    # Step 3: Embed and store
    # ------------------------------------------------------------------

    def embed_and_store(
        self,
        chunks: list[Chunk],
        collection_name: str = "documents",
        batch_size: int = 96,
    ) -> None:
        """
        Generate embeddings for each chunk and upsert into ChromaDB.

        Embeddings are generated using Anthropic's voyage-3 model in batches
        to respect API rate limits. Existing chunks with the same ID are
        overwritten (upsert semantics).

        Args:
            chunks: Chunks to embed and store.
            collection_name: Name of the ChromaDB collection.
            batch_size: Number of chunks to embed per API call (max 96 for voyage-3).
        """
        if not chunks:
            print("No chunks to store.")
            return

        collection = self._chroma.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )

        total_batches = (len(chunks) + batch_size - 1) // batch_size

        for batch_idx in range(0, len(chunks), batch_size):
            batch = chunks[batch_idx : batch_idx + batch_size]
            current_batch = batch_idx // batch_size + 1
            print(
                f"  Embedding batch {current_batch}/{total_batches} "
                f"({len(batch)} chunks)..."
            )

            texts = [chunk.content for chunk in batch]

            # Generate embeddings via Anthropic voyage-3
            response = self._anthropic.embeddings.create(
                model="voyage-3",
                input=texts,
            )

            embeddings = [item.embedding for item in response.data]

            # Store embeddings in chunk objects (optional, for inspection)
            for chunk, embedding in zip(batch, embeddings):
                chunk.embedding = embedding

            # Upsert into ChromaDB
            collection.upsert(
                ids=[chunk.id for chunk in batch],
                embeddings=embeddings,
                documents=texts,
                metadatas=[
                    {
                        # ChromaDB metadata values must be str, int, float, or bool
                        k: (str(v) if not isinstance(v, (str, int, float, bool)) else v)
                        for k, v in chunk.metadata.items()
                    }
                    for chunk in batch
                ],
            )

        print(
            f"Stored {len(chunks)} chunk(s) in ChromaDB collection '{collection_name}'."
        )
