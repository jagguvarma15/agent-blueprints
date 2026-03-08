/**
 * Entry point for Blueprint 07: RAG Basic (TypeScript).
 *
 * Demonstrates the full RAG pipeline:
 *   1. Ingest documents from the ../python/data/ directory into ChromaDB.
 *   2. Ask example questions and print answers with sources.
 *
 * Usage:
 *   pnpm dev
 *   # or
 *   npx tsx src/index.ts
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";

import "dotenv/config";

import { DocumentIngester } from "./ingestion.js";
import { RAGChain } from "./ragChain.js";
import { VectorRetriever } from "./retrieval.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const COLLECTION_NAME = process.env.COLLECTION_NAME ?? "documents";
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE ?? "500");
const CHUNK_OVERLAP = Number(process.env.CHUNK_OVERLAP ?? "50");
const TOP_K = Number(process.env.TOP_K ?? "5");
const CHROMA_HOST = process.env.CHROMA_HOST ?? "localhost";
const CHROMA_PORT = Number(process.env.CHROMA_PORT ?? "8000");

// Resolve data directory relative to this file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../python/data");

// Example questions that can be answered from sample.md
const EXAMPLE_QUESTIONS = [
  "What is the ReAct agent pattern and how does it work?",
  "How does retrieval-augmented generation work?",
  "What are embeddings and how are they used for vector search?",
  "What safety considerations are important for AI agents?",
  "When should you NOT use RAG?",
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  checkApiKey();

  console.log("=".repeat(70));
  console.log("Blueprint 07: RAG Basic Demo (TypeScript)");
  console.log("=".repeat(70));

  // ------------------------------------------------------------------
  // Phase 1: Ingestion
  // ------------------------------------------------------------------
  console.log("\n[Phase 1] Ingesting documents...");
  console.log(`  Source directory : ${DATA_DIR}`);
  console.log(`  Collection       : ${COLLECTION_NAME}`);
  console.log(`  Chunk size       : ${CHUNK_SIZE} chars (overlap: ${CHUNK_OVERLAP})`);
  console.log();

  const ingester = new DocumentIngester({
    chromaHost: CHROMA_HOST,
    chromaPort: CHROMA_PORT,
  });

  const docs = ingester.loadDocuments(DATA_DIR);
  const chunks = ingester.chunkDocuments(docs, {
    chunkSize: CHUNK_SIZE,
    overlap: CHUNK_OVERLAP,
  });
  await ingester.embedAndStore(chunks, COLLECTION_NAME);

  console.log("\nIngestion complete.");

  // ------------------------------------------------------------------
  // Phase 2: Query
  // ------------------------------------------------------------------
  console.log("\n" + "=".repeat(70));
  console.log("[Phase 2] Querying the knowledge base...");
  console.log("=".repeat(70));

  const retriever = new VectorRetriever({
    collectionName: COLLECTION_NAME,
    chromaHost: CHROMA_HOST,
    chromaPort: CHROMA_PORT,
  });

  const stats = await retriever.getCollectionStats();
  console.log(`\nCollection stats:`, stats);

  const chain = new RAGChain(retriever, { topK: TOP_K });

  for (let i = 0; i < EXAMPLE_QUESTIONS.length; i++) {
    const question = EXAMPLE_QUESTIONS[i];
    console.log(`\n${"=".repeat(70)}`);
    console.log(`Question ${i + 1}/${EXAMPLE_QUESTIONS.length}: ${question}`);
    console.log("-".repeat(70));

    const response = await chain.query(question);

    console.log(`\nAnswer:\n${response.answer}`);
    console.log(`\nSources (${response.sources.length}):`);
    for (const source of response.sources) {
      console.log(`  - ${source}`);
    }

    console.log(`\nRetrieved ${response.retrievedChunks.length} chunk(s):`);
    response.retrievedChunks.forEach((chunk, j) => {
      const similarity = chunk.metadata.similarity ?? "N/A";
      const fileName = chunk.source.split("/").pop();
      console.log(`  [${j + 1}] similarity=${similarity}  source=${fileName}`);
    });
  }

  console.log("\n" + "=".repeat(70));
  console.log("Demo complete.");
  console.log("=".repeat(70));
}

function checkApiKey(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Error: ANTHROPIC_API_KEY is not set.\n" +
        "  1. Copy .env.example to .env\n" +
        "  2. Add your Anthropic API key to .env\n" +
        "  3. Re-run the script."
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
