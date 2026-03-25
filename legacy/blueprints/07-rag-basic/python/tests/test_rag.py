"""
Tests for Blueprint 07: RAG Basic.

Uses pytest-mock to patch ChromaDB and Anthropic so tests run without
external services or API keys. Covers:

  - Document loading (from temp files)
  - Text chunking (size, overlap, edge cases)
  - Embed-and-store (verifies ChromaDB upsert is called correctly)
  - Retrieval (verifies embedding + similarity search + Chunk hydration)
  - Full RAG chain (mocks retriever, verifies Claude is called with context)
"""

from __future__ import annotations

import os
import textwrap
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def set_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure ANTHROPIC_API_KEY is set for all tests without a real key."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-placeholder")


@pytest.fixture()
def sample_txt_file(tmp_path: Path) -> Path:
    """Create a temporary .txt file with known content."""
    content = textwrap.dedent(
        """\
        Introduction to Machine Learning

        Machine learning is a branch of artificial intelligence focused on building
        systems that learn from data. It encompasses supervised learning, where models
        are trained on labeled examples, and unsupervised learning, where patterns are
        discovered without labels.

        Deep learning is a subset of machine learning that uses neural networks with
        many layers. These networks excel at tasks like image recognition, natural
        language processing, and speech synthesis.
        """
    )
    file = tmp_path / "ml_intro.txt"
    file.write_text(content, encoding="utf-8")
    return file


@pytest.fixture()
def sample_md_file(tmp_path: Path) -> Path:
    """Create a temporary .md file with known content."""
    content = textwrap.dedent(
        """\
        # Vector Databases

        Vector databases store high-dimensional embeddings and support efficient
        similarity search. Examples include ChromaDB, Pinecone, and Weaviate.

        ## How They Work

        Each document is converted to a dense vector. At query time, the nearest
        vectors are found using approximate nearest-neighbor algorithms like HNSW.
        """
    )
    file = tmp_path / "vector_dbs.md"
    file.write_text(content, encoding="utf-8")
    return file


# ---------------------------------------------------------------------------
# Helpers: Mocked Anthropic embedding response
# ---------------------------------------------------------------------------


def make_embedding_response(texts: list[str], dims: int = 8) -> MagicMock:
    """Build a mock Anthropic embeddings response for the given texts."""
    response = MagicMock()
    response.data = [
        MagicMock(embedding=[float(i % dims) / dims for _ in range(dims)])
        for i, _ in enumerate(texts)
    ]
    return response


# ---------------------------------------------------------------------------
# Tests: Document loading
# ---------------------------------------------------------------------------


class TestDocumentLoading:
    def test_load_single_txt_file(self, sample_txt_file: Path) -> None:
        from src.ingestion import DocumentIngester

        with patch("chromadb.HttpClient"), patch("anthropic.Anthropic"):
            ingester = DocumentIngester()

        docs = ingester.load_documents(str(sample_txt_file))

        assert len(docs) == 1
        assert docs[0].source == str(sample_txt_file)
        assert "Machine learning" in docs[0].content
        assert docs[0].metadata["file_type"] == "txt"
        assert docs[0].metadata["char_count"] > 0

    def test_load_directory_with_multiple_files(
        self, tmp_path: Path, sample_txt_file: Path, sample_md_file: Path
    ) -> None:
        from src.ingestion import DocumentIngester

        # Both files are in tmp_path
        with patch("chromadb.HttpClient"), patch("anthropic.Anthropic"):
            ingester = DocumentIngester()

        docs = ingester.load_documents(str(tmp_path))

        assert len(docs) == 2
        sources = {doc.metadata["file_name"] for doc in docs}
        assert "ml_intro.txt" in sources
        assert "vector_dbs.md" in sources

    def test_load_nonexistent_path_raises(self) -> None:
        from src.ingestion import DocumentIngester

        with patch("chromadb.HttpClient"), patch("anthropic.Anthropic"):
            ingester = DocumentIngester()

        with pytest.raises(FileNotFoundError, match="does not exist"):
            ingester.load_documents("/tmp/nonexistent_blueprint_07_path")

    def test_load_directory_with_no_supported_files_raises(
        self, tmp_path: Path
    ) -> None:
        from src.ingestion import DocumentIngester

        # Create a file with an unsupported extension
        (tmp_path / "data.json").write_text("{}", encoding="utf-8")

        with patch("chromadb.HttpClient"), patch("anthropic.Anthropic"):
            ingester = DocumentIngester()

        with pytest.raises(ValueError, match="No supported files"):
            ingester.load_documents(str(tmp_path))

    def test_document_id_is_deterministic(self, sample_txt_file: Path) -> None:
        from src.ingestion import DocumentIngester

        with patch("chromadb.HttpClient"), patch("anthropic.Anthropic"):
            ingester = DocumentIngester()

        docs1 = ingester.load_documents(str(sample_txt_file))
        docs2 = ingester.load_documents(str(sample_txt_file))

        assert docs1[0].id == docs2[0].id


# ---------------------------------------------------------------------------
# Tests: Text chunking
# ---------------------------------------------------------------------------


class TestChunking:
    def _make_ingester(self) -> object:
        from src.ingestion import DocumentIngester

        with patch("chromadb.HttpClient"), patch("anthropic.Anthropic"):
            return DocumentIngester()

    def _make_doc(self, content: str) -> object:
        from src.ingestion import Document

        return Document(
            id="test_doc",
            content=content,
            source="/tmp/test.txt",
            metadata={"title": "Test", "file_type": "txt", "char_count": len(content)},
        )

    def test_chunk_count_for_known_text(self) -> None:
        ingester = self._make_ingester()
        # 1000 chars, chunk_size=400, overlap=50 → step=350
        # Expected starts: 0, 350, 700 → 3 chunks
        content = "A" * 1000
        doc = self._make_doc(content)
        chunks = ingester.chunk_documents([doc], chunk_size=400, overlap=50)
        assert len(chunks) >= 2  # At least 2 chunks

    def test_chunks_cover_all_content(self) -> None:
        ingester = self._make_ingester()
        content = "Hello world. " * 50  # ~650 chars
        doc = self._make_doc(content)
        chunks = ingester.chunk_documents([doc], chunk_size=200, overlap=20)

        # All content should be covered (no chars lost)
        recovered = " ".join(c.content for c in chunks)
        # Every word from the original appears somewhere in the chunks
        for word in content.split():
            assert word in recovered

    def test_chunk_size_respected(self) -> None:
        ingester = self._make_ingester()
        content = "word " * 200  # ~1000 chars
        doc = self._make_doc(content)
        chunk_size = 100
        chunks = ingester.chunk_documents([doc], chunk_size=chunk_size, overlap=10)

        # No chunk should be dramatically larger than chunk_size
        for chunk in chunks:
            assert len(chunk.content) <= chunk_size * 1.5  # Allow some flexibility for boundaries

    def test_chunk_metadata_populated(self, sample_txt_file: Path) -> None:
        ingester = self._make_ingester()
        from src.ingestion import Document

        doc = Document.from_file(sample_txt_file)
        chunks = ingester.chunk_documents([doc], chunk_size=200, overlap=20)

        assert len(chunks) > 0
        for i, chunk in enumerate(chunks):
            assert chunk.metadata["chunk_index"] == i
            assert chunk.metadata["total_chunks"] == len(chunks)
            assert "char_start" in chunk.metadata
            assert "char_end" in chunk.metadata
            assert chunk.source == str(sample_txt_file)

    def test_chunk_ids_are_unique(self, sample_txt_file: Path) -> None:
        ingester = self._make_ingester()
        from src.ingestion import Document

        doc = Document.from_file(sample_txt_file)
        chunks = ingester.chunk_documents([doc], chunk_size=100, overlap=10)

        ids = [c.id for c in chunks]
        assert len(ids) == len(set(ids)), "Chunk IDs must be unique"

    def test_empty_content_produces_no_chunks(self) -> None:
        ingester = self._make_ingester()
        doc = self._make_doc("   \n\n   ")  # whitespace only
        chunks = ingester.chunk_documents([doc])
        assert len(chunks) == 0

    def test_invalid_chunk_size_raises(self) -> None:
        ingester = self._make_ingester()
        doc = self._make_doc("some content")
        with pytest.raises(ValueError, match="chunk_size must be positive"):
            ingester.chunk_documents([doc], chunk_size=0)

    def test_overlap_ge_chunk_size_raises(self) -> None:
        ingester = self._make_ingester()
        doc = self._make_doc("some content here for testing")
        with pytest.raises(ValueError, match="overlap.*must be less than chunk_size"):
            ingester.chunk_documents([doc], chunk_size=100, overlap=100)

    def test_multiple_docs_chunked_independently(self) -> None:
        ingester = self._make_ingester()
        from src.ingestion import Document

        doc_a = Document(id="a", content="Content A. " * 30, source="/a.txt", metadata={})
        doc_b = Document(id="b", content="Content B. " * 30, source="/b.txt", metadata={})

        chunks = ingester.chunk_documents([doc_a, doc_b], chunk_size=100, overlap=10)

        sources = {c.source for c in chunks}
        assert "/a.txt" in sources
        assert "/b.txt" in sources


# ---------------------------------------------------------------------------
# Tests: embed_and_store
# ---------------------------------------------------------------------------


class TestEmbedAndStore:
    def test_embed_and_store_calls_upsert(self, sample_txt_file: Path) -> None:
        from src.ingestion import Chunk, DocumentIngester

        mock_collection = MagicMock()
        mock_chroma_client = MagicMock()
        mock_chroma_client.get_or_create_collection.return_value = mock_collection

        mock_anthropic_client = MagicMock()
        mock_anthropic_client.embeddings.create.return_value = make_embedding_response(
            ["chunk 1", "chunk 2"]
        )

        with (
            patch("chromadb.HttpClient", return_value=mock_chroma_client),
            patch("anthropic.Anthropic", return_value=mock_anthropic_client),
        ):
            ingester = DocumentIngester()

        chunks = [
            Chunk(
                id="doc_chunk_0000",
                content="chunk 1",
                source="/test.txt",
                metadata={"title": "Test", "file_type": "txt", "char_count": 7},
            ),
            Chunk(
                id="doc_chunk_0001",
                content="chunk 2",
                source="/test.txt",
                metadata={"title": "Test", "file_type": "txt", "char_count": 7},
            ),
        ]

        ingester.embed_and_store(chunks, collection_name="test_collection")

        # Verify upsert was called
        mock_collection.upsert.assert_called_once()
        call_kwargs = mock_collection.upsert.call_args.kwargs
        assert call_kwargs["ids"] == ["doc_chunk_0000", "doc_chunk_0001"]
        assert call_kwargs["documents"] == ["chunk 1", "chunk 2"]
        assert len(call_kwargs["embeddings"]) == 2

    def test_embed_and_store_empty_chunks(self) -> None:
        """No API calls should be made when chunks list is empty."""
        mock_anthropic_client = MagicMock()
        mock_chroma_client = MagicMock()

        with (
            patch("chromadb.HttpClient", return_value=mock_chroma_client),
            patch("anthropic.Anthropic", return_value=mock_anthropic_client),
        ):
            from src.ingestion import DocumentIngester

            ingester = DocumentIngester()

        ingester.embed_and_store([], collection_name="test")

        mock_anthropic_client.embeddings.create.assert_not_called()


# ---------------------------------------------------------------------------
# Tests: VectorRetriever
# ---------------------------------------------------------------------------


class TestVectorRetriever:
    def _make_retriever(
        self,
        mock_chroma_client: MagicMock,
        mock_anthropic_client: MagicMock,
    ) -> object:
        with (
            patch("chromadb.HttpClient", return_value=mock_chroma_client),
            patch("anthropic.Anthropic", return_value=mock_anthropic_client),
        ):
            from src.retrieval import VectorRetriever

            return VectorRetriever(collection_name="test")

    def test_retrieve_returns_chunks(self) -> None:
        mock_collection = MagicMock()
        mock_collection.count.return_value = 10
        mock_collection.query.return_value = {
            "ids": [["chunk_0", "chunk_1"]],
            "documents": [["First chunk text.", "Second chunk text."]],
            "metadatas": [
                [
                    {"source": "/doc1.txt", "chunk_index": 0},
                    {"source": "/doc2.txt", "chunk_index": 0},
                ]
            ],
            "distances": [[0.1, 0.3]],
        }

        mock_chroma = MagicMock()
        mock_chroma.get_or_create_collection.return_value = mock_collection

        mock_anthropic = MagicMock()
        mock_anthropic.embeddings.create.return_value = make_embedding_response(
            ["test query"]
        )

        retriever = self._make_retriever(mock_chroma, mock_anthropic)
        chunks = retriever.retrieve("test query", top_k=2)

        assert len(chunks) == 2
        assert chunks[0].id == "chunk_0"
        assert chunks[0].content == "First chunk text."
        assert chunks[0].source == "/doc1.txt"
        # similarity = 1 - distance = 1 - 0.1 = 0.9
        assert abs(chunks[0].metadata["similarity"] - 0.9) < 0.001
        assert chunks[1].metadata["similarity"] == pytest.approx(0.7, abs=0.001)

    def test_retrieve_empty_query_raises(self) -> None:
        mock_collection = MagicMock()
        mock_collection.count.return_value = 5

        mock_chroma = MagicMock()
        mock_chroma.get_or_create_collection.return_value = mock_collection
        mock_anthropic = MagicMock()

        retriever = self._make_retriever(mock_chroma, mock_anthropic)

        with pytest.raises(ValueError, match="Query must not be empty"):
            retriever.retrieve("   ")

    def test_retrieve_empty_collection_raises(self) -> None:
        mock_collection = MagicMock()
        mock_collection.count.return_value = 0

        mock_chroma = MagicMock()
        mock_chroma.get_or_create_collection.return_value = mock_collection
        mock_anthropic = MagicMock()

        retriever = self._make_retriever(mock_chroma, mock_anthropic)

        with pytest.raises(ValueError, match="empty"):
            retriever.retrieve("some question")

    def test_top_k_clamped_to_collection_size(self) -> None:
        mock_collection = MagicMock()
        mock_collection.count.return_value = 3  # Only 3 chunks exist
        mock_collection.query.return_value = {
            "ids": [["c1", "c2", "c3"]],
            "documents": [["a", "b", "c"]],
            "metadatas": [[{"source": "/f.txt"}, {"source": "/f.txt"}, {"source": "/f.txt"}]],
            "distances": [[0.1, 0.2, 0.3]],
        }

        mock_chroma = MagicMock()
        mock_chroma.get_or_create_collection.return_value = mock_collection
        mock_anthropic = MagicMock()
        mock_anthropic.embeddings.create.return_value = make_embedding_response(["q"])

        retriever = self._make_retriever(mock_chroma, mock_anthropic)
        chunks = retriever.retrieve("question", top_k=10)

        # n_results should be clamped to 3
        call_kwargs = mock_collection.query.call_args.kwargs
        assert call_kwargs["n_results"] == 3
        assert len(chunks) == 3


# ---------------------------------------------------------------------------
# Tests: RAGChain
# ---------------------------------------------------------------------------


class TestRAGChain:
    def _make_chain(
        self,
        mock_retriever: MagicMock,
        mock_anthropic_client: MagicMock,
    ) -> object:
        with patch("anthropic.Anthropic", return_value=mock_anthropic_client):
            from src.rag_chain import RAGChain

            return RAGChain(retriever=mock_retriever, model="claude-opus-4-6", top_k=3)

    def _make_chunks(self) -> list:
        from src.ingestion import Chunk

        return [
            Chunk(
                id="doc_chunk_0000",
                content="RAG stands for Retrieval-Augmented Generation.",
                source="/data/sample.md",
                metadata={"similarity": 0.92, "title": "sample"},
            ),
            Chunk(
                id="doc_chunk_0001",
                content="Embeddings are dense vector representations of text.",
                source="/data/sample.md",
                metadata={"similarity": 0.85, "title": "sample"},
            ),
        ]

    def test_query_returns_rag_response(self) -> None:
        from src.rag_chain import RAGResponse

        mock_retriever = MagicMock()
        mock_retriever.retrieve.return_value = self._make_chunks()

        mock_message = MagicMock()
        mock_message.content = [MagicMock(text="RAG retrieves relevant document chunks.")]

        mock_anthropic = MagicMock()
        mock_anthropic.messages.create.return_value = mock_message

        chain = self._make_chain(mock_retriever, mock_anthropic)
        response = chain.query("What is RAG?")

        assert isinstance(response, RAGResponse)
        assert response.answer == "RAG retrieves relevant document chunks."
        assert "/data/sample.md" in response.sources
        assert len(response.retrieved_chunks) == 2

    def test_query_calls_anthropic_with_context(self) -> None:
        mock_retriever = MagicMock()
        mock_retriever.retrieve.return_value = self._make_chunks()

        mock_message = MagicMock()
        mock_message.content = [MagicMock(text="Some answer.")]

        mock_anthropic = MagicMock()
        mock_anthropic.messages.create.return_value = mock_message

        chain = self._make_chain(mock_retriever, mock_anthropic)
        chain.query("What is RAG?")

        call_kwargs = mock_anthropic.messages.create.call_args.kwargs
        # System prompt should be set
        assert "context" in call_kwargs["system"].lower() or "assistant" in call_kwargs["system"].lower()
        # User message should contain retrieved content
        user_content = call_kwargs["messages"][0]["content"]
        assert "RAG stands for" in user_content
        assert "What is RAG?" in user_content

    def test_query_empty_question_raises(self) -> None:
        mock_retriever = MagicMock()
        mock_anthropic = MagicMock()

        chain = self._make_chain(mock_retriever, mock_anthropic)

        with pytest.raises(ValueError, match="Question must not be empty"):
            chain.query("  ")

    def test_sources_are_deduplicated(self) -> None:
        from src.ingestion import Chunk

        # Both chunks have the same source
        chunks = [
            Chunk(
                id="c1",
                content="Content A",
                source="/data/doc.md",
                metadata={"similarity": 0.9},
            ),
            Chunk(
                id="c2",
                content="Content B",
                source="/data/doc.md",
                metadata={"similarity": 0.8},
            ),
        ]

        mock_retriever = MagicMock()
        mock_retriever.retrieve.return_value = chunks

        mock_message = MagicMock()
        mock_message.content = [MagicMock(text="Answer here.")]

        mock_anthropic = MagicMock()
        mock_anthropic.messages.create.return_value = mock_message

        chain = self._make_chain(mock_retriever, mock_anthropic)
        response = chain.query("Some question?")

        # Despite 2 chunks from same source, only 1 source in response
        assert response.sources == ["/data/doc.md"]
        assert len(response.sources) == 1

    def test_rag_response_str_format(self) -> None:
        from src.ingestion import Chunk
        from src.rag_chain import RAGResponse

        chunk = Chunk(id="c1", content="text", source="/a.txt", metadata={})
        resp = RAGResponse(
            answer="This is the answer.",
            sources=["/a.txt"],
            retrieved_chunks=[chunk],
        )
        output = str(resp)
        assert "This is the answer." in output
        assert "/a.txt" in output
        assert "1 chunk(s)" in output


# ---------------------------------------------------------------------------
# Tests: Integration (end-to-end with all mocks)
# ---------------------------------------------------------------------------


class TestEndToEnd:
    """Smoke test the full pipeline with everything mocked."""

    def test_full_pipeline(self, tmp_path: Path) -> None:
        from src.ingestion import Chunk, Document, DocumentIngester
        from src.rag_chain import RAGChain
        from src.retrieval import VectorRetriever

        # --- Create a temp document ---
        doc_file = tmp_path / "test.txt"
        doc_file.write_text(
            "Artificial intelligence is transforming every industry. "
            "Machine learning models learn patterns from large datasets. "
            "Neural networks are inspired by the human brain.",
            encoding="utf-8",
        )

        # --- Mock ChromaDB and Anthropic ---
        mock_collection = MagicMock()
        mock_collection.count.return_value = 2
        mock_chroma = MagicMock()
        mock_chroma.get_or_create_collection.return_value = mock_collection

        retrieved_chunk = Chunk(
            id="test_chunk_0000",
            content="Artificial intelligence is transforming every industry.",
            source=str(doc_file),
            metadata={"similarity": 0.95, "title": "test"},
        )
        mock_collection.query.return_value = {
            "ids": [[retrieved_chunk.id]],
            "documents": [[retrieved_chunk.content]],
            "metadatas": [[{"source": retrieved_chunk.source, "similarity": 0.95}]],
            "distances": [[0.05]],
        }

        mock_embed_response = make_embedding_response(["text"], dims=8)
        mock_anthropic_client = MagicMock()
        mock_anthropic_client.embeddings.create.return_value = mock_embed_response

        mock_message = MagicMock()
        mock_message.content = [MagicMock(text="AI is transforming industries.")]
        mock_anthropic_client.messages.create.return_value = mock_message

        with (
            patch("chromadb.HttpClient", return_value=mock_chroma),
            patch("anthropic.Anthropic", return_value=mock_anthropic_client),
        ):
            # Ingestion
            ingester = DocumentIngester()
            docs = ingester.load_documents(str(doc_file))
            chunks = ingester.chunk_documents(docs, chunk_size=100, overlap=10)
            ingester.embed_and_store(chunks, collection_name="e2e_test")

            # Retrieval
            retriever = VectorRetriever(collection_name="e2e_test")
            chain = RAGChain(retriever=retriever, top_k=3)
            response = chain.query("What is AI?")

        assert response.answer == "AI is transforming industries."
        assert len(response.sources) >= 1
