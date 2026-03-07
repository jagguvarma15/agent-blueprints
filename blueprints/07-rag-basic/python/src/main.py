"""
Demo script for Blueprint 07: RAG Basic.

Demonstrates the full RAG pipeline:
  1. Ingest documents from the data/ directory into ChromaDB.
  2. Ask example questions and print answers with sources.

Usage:
    uv run dev
    # or
    python -m src.main
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env file before importing modules that read env vars
load_dotenv()

from src.ingestion import DocumentIngester  # noqa: E402
from src.rag_chain import RAGChain  # noqa: E402
from src.retrieval import VectorRetriever  # noqa: E402

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

COLLECTION_NAME = os.environ.get("COLLECTION_NAME", "documents")
CHUNK_SIZE = int(os.environ.get("CHUNK_SIZE", "500"))
CHUNK_OVERLAP = int(os.environ.get("CHUNK_OVERLAP", "50"))
TOP_K = int(os.environ.get("TOP_K", "5"))
CHROMA_HOST = os.environ.get("CHROMA_HOST", "localhost")
CHROMA_PORT = int(os.environ.get("CHROMA_PORT", "8000"))

# Path to sample data directory
DATA_DIR = Path(__file__).parent.parent / "data"

# Example questions that can be answered from sample.md
EXAMPLE_QUESTIONS = [
    "What is the ReAct agent pattern and how does it work?",
    "How does retrieval-augmented generation work?",
    "What are embeddings and how are they used for vector search?",
    "What safety considerations are important for AI agents?",
    "When should you NOT use RAG?",
]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    """Run the full RAG demo: ingest documents, then answer example questions."""
    _check_api_key()

    print("=" * 70)
    print("Blueprint 07: RAG Basic Demo")
    print("=" * 70)

    # ------------------------------------------------------------------
    # Phase 1: Ingestion
    # ------------------------------------------------------------------
    print("\n[Phase 1] Ingesting documents...")
    print(f"  Source directory : {DATA_DIR}")
    print(f"  Collection       : {COLLECTION_NAME}")
    print(f"  Chunk size       : {CHUNK_SIZE} chars (overlap: {CHUNK_OVERLAP})")
    print()

    ingester = DocumentIngester(
        chroma_host=CHROMA_HOST,
        chroma_port=CHROMA_PORT,
    )

    docs = ingester.load_documents(str(DATA_DIR))
    chunks = ingester.chunk_documents(docs, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP)
    ingester.embed_and_store(chunks, collection_name=COLLECTION_NAME)

    print("\nIngestion complete.")

    # ------------------------------------------------------------------
    # Phase 2: Query
    # ------------------------------------------------------------------
    print("\n" + "=" * 70)
    print("[Phase 2] Querying the knowledge base...")
    print("=" * 70)

    retriever = VectorRetriever(
        collection_name=COLLECTION_NAME,
        chroma_host=CHROMA_HOST,
        chroma_port=CHROMA_PORT,
    )
    stats = retriever.get_collection_stats()
    print(f"\nCollection stats: {stats}")

    chain = RAGChain(retriever=retriever, top_k=TOP_K)

    for i, question in enumerate(EXAMPLE_QUESTIONS, start=1):
        print(f"\n{'=' * 70}")
        print(f"Question {i}/{len(EXAMPLE_QUESTIONS)}: {question}")
        print("-" * 70)

        response = chain.query(question)

        print(f"\nAnswer:\n{response.answer}")
        print(f"\nSources ({len(response.sources)}):")
        for source in response.sources:
            print(f"  - {source}")

        print(f"\nRetrieved {len(response.retrieved_chunks)} chunk(s):")
        for j, chunk in enumerate(response.retrieved_chunks, start=1):
            similarity = chunk.metadata.get("similarity", "N/A")
            print(
                f"  [{j}] similarity={similarity:.4f}  "
                f"source={chunk.source.split('/')[-1]}"
            )

    print("\n" + "=" * 70)
    print("Demo complete.")
    print("=" * 70)


def _check_api_key() -> None:
    """Validate that the Anthropic API key is set."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print(
            "Error: ANTHROPIC_API_KEY is not set.\n"
            "  1. Copy .env.example to .env\n"
            "  2. Add your Anthropic API key to .env\n"
            "  3. Re-run the script.",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
