/**
 * RAG — Vercel AI SDK variant.
 *
 * Pattern: RAG (Retrieval-Augmented Generation: chunk + embed + retrieve, then generate).
 * Framework: Vercel AI SDK (ai ^4.0.0) + @ai-sdk/anthropic (^1.0.0).
 * Idioms: retrieve happens in app code (not as a model-side tool), and the
 *   retrieved chunks are inlined into the system prompt before generateText
 *   produces the grounded answer. Matches the dominant Vercel AI SDK RAG shape.
 * Design doc: ../../../design.md (the framework-agnostic ../../python/rag.py
 *   walks the chunk → embed → store → retrieve → generate cycle with the
 *   same three seed documents and the same query).
 *
 * Install:  pnpm add ai @ai-sdk/anthropic
 *           (or via tsx-on-demand: npx tsx rag.ts)
 * Run:      ANTHROPIC_API_KEY=... npx tsx rag.ts
 *
 * Why retrieve outside the model call: the Vercel AI SDK's strength is the
 * thin generateText/streamText surface. Wrapping retrieval as a tool the model
 * has to call costs an extra round trip with no quality gain for the simple
 * case. Reach for the agent-with-retriever-tool shape only when the model
 * needs to decide *whether* to retrieve — see the recipe at
 * docs/recipes/docs-rag-qa.md for the agentic variant.
 *
 * Note: ESM only (matches the canonical TypeScript project layout).
 * tsconfig snippet: { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022" }
 */

import { createHash } from "node:crypto";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

// ── Types ────────────────────────────────────────────────────────────────────

interface Chunk {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

interface RAGResult {
  answer: string;
  chunksUsed: Chunk[];
  query: string;
}

interface Embedder {
  embed(text: string): number[];
}

// ── Deterministic mock embedder (matches the Python sibling) ─────────────────

class HashEmbedder implements Embedder {
  embed(text: string): number[] {
    // 8-dim vector seeded from the md5 of the text. Same shape as the
    // MockEmbedder in ../../python/rag.py so the two siblings can be
    // diffed at the chunk-score level.
    const digest = createHash("md5").update(text).digest("hex");
    const big = BigInt(`0x${digest}`);
    const vec: number[] = [];
    for (let i = 0; i < 8; i++) {
      const shifted = (big >> BigInt(i * 8)) & 0xffn;
      vec.push(Number(shifted) / 255);
    }
    return vec;
  }
}

// ── In-memory vector store ───────────────────────────────────────────────────
// Replace with pgvector (rides the relational database already in the stack),
// Qdrant, or Chroma in production.

class InMemoryVectorStore {
  private items: Array<{ id: string; embedding: number[]; text: string; metadata: Record<string, unknown> }> = [];

  add(id: string, embedding: number[], text: string, metadata: Record<string, unknown>): void {
    this.items.push({ id, embedding, text, metadata });
  }

  search(embedding: number[], topK: number): Chunk[] {
    const dot = (a: number[], b: number[]): number => a.reduce((sum, x, i) => sum + x * b[i], 0);
    return this.items
      .map((item) => ({
        id: item.id,
        text: item.text,
        score: dot(embedding, item.embedding),
        metadata: item.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

// ── Pipeline ────────────────────────────────────────────────────────────────

interface RAGOptions {
  topK?: number;
  chunkSize?: number;
  chunkOverlap?: number;
  system?: string;
}

const DEFAULT_SYSTEM =
  "You answer questions from the provided context. If the context does not " +
  "contain the answer, say so plainly instead of guessing.";

class RAGPipeline {
  private store = new InMemoryVectorStore();
  private chunkCounter = 0;

  constructor(
    private readonly embedder: Embedder,
    private readonly model = anthropic("claude-haiku-4-5"),
    private readonly opts: Required<RAGOptions> = {
      topK: 2,
      chunkSize: 200,
      chunkOverlap: 50,
      system: DEFAULT_SYSTEM,
    },
  ) {}

  private split(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = start + this.opts.chunkSize;
      const slice = text.slice(start, end).trim();
      if (slice) chunks.push(slice);
      start += this.opts.chunkSize - this.opts.chunkOverlap;
    }
    return chunks;
  }

  ingest(documents: string[], metadata: Array<Record<string, unknown>> = []): number {
    let added = 0;
    documents.forEach((doc, i) => {
      const meta = metadata[i] ?? {};
      for (const text of this.split(doc)) {
        const id = `chunk_${this.chunkCounter++}`;
        this.store.add(id, this.embedder.embed(text), text, meta);
        added++;
      }
    });
    return added;
  }

  async query(question: string): Promise<RAGResult> {
    const qEmbedding = this.embedder.embed(question);
    const chunks = this.store.search(qEmbedding, this.opts.topK);

    const context = chunks
      .map((c, i) => `[Source ${i + 1}]\n${c.text}`)
      .join("\n\n---\n\n");

    const userPrompt =
      `Answer the question using only the provided context. If the context does ` +
      `not contain enough information, say so clearly.\n\n` +
      `Context:\n${context}\n\nQuestion: ${question}`;

    const result = await generateText({
      model: this.model,
      system: this.opts.system,
      prompt: userPrompt,
    });

    return { answer: result.text, chunksUsed: chunks, query: question };
  }
}

// ── Smoke runner ────────────────────────────────────────────────────────────

const SEED_DOCUMENTS = [
  "ReAct is a prompting technique that combines chain-of-thought reasoning with action execution.",
  "RAG stands for Retrieval-Augmented Generation. It retrieves relevant documents before generating.",
  "Plan and Execute separates planning from execution. The planner creates a full plan upfront.",
];

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Skipping smoke run — set ANTHROPIC_API_KEY to exercise the real generate path.");

    // Run ingestion + retrieval without the model so the dispatcher contract
    // is still exercisable offline.
    const pipeline = new RAGPipeline(new HashEmbedder());
    const n = pipeline.ingest(SEED_DOCUMENTS);
    console.log(`Ingested ${n} chunks (offline).`);
    return;
  }

  const pipeline = new RAGPipeline(new HashEmbedder());
  const n = pipeline.ingest(SEED_DOCUMENTS);
  console.log(`Ingested ${n} chunks`);

  const result = await pipeline.query("What is RAG and how does it work?");
  console.log(`Retrieved ${result.chunksUsed.length} chunks`);
  console.log(`Answer: ${result.answer.slice(0, 120)}`);
}

// ESM entry-point check.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { RAGPipeline, InMemoryVectorStore, HashEmbedder };
export type { Chunk, RAGResult, Embedder, RAGOptions };
