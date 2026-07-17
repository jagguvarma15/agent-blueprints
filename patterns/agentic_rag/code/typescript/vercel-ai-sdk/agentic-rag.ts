/**
 * Agentic RAG — Vercel AI SDK variant.
 *
 * Pattern: Agentic RAG (hybrid retrieval + late reranking inside a reflection loop).
 * Framework: Vercel AI SDK (ai ^4.0.0) + @ai-sdk/anthropic (^1.0.0).
 * Idioms: dense and sparse search run in app code and are fused with
 *   reciprocal rank fusion; a reranker re-scores the fused candidates against
 *   the question; a sufficiency check retries with a widened query before
 *   generateText produces the cited answer.
 * Design doc: ../../../design.md (the framework-agnostic
 *   ../../python/agentic_rag.py walks the same hybrid retrieve, rerank,
 *   reflect, generate cycle with the same seed documents and query).
 *
 * Install:  pnpm add ai @ai-sdk/anthropic
 * Run:      ANTHROPIC_API_KEY=... npx tsx agentic-rag.ts
 *
 * The reranker here is a keyword-overlap stand-in so the file runs offline.
 * Replace it with a hosted reranker (Cohere Rerank) or a local cross-encoder
 * to ship; replace the in-memory hybrid index with a store that runs both
 * retrievals natively (Qdrant hybrid queries, or pgvector plus Postgres
 * full-text search).
 *
 * Note: ESM only (matches the canonical TypeScript project layout).
 */

import { createHash } from "node:crypto";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

// --- Types -------------------------------------------------------------------

interface Candidate {
  id: string;
  text: string;
  denseScore: number;
  sparseScore: number;
  fusedScore: number;
  rerankScore: number;
  metadata: Record<string, unknown>;
}

interface AgenticRAGResult {
  answer: string;
  evidence: Candidate[];
  attempts: number;
  grounded: boolean;
}

interface Embedder {
  embed(text: string): number[];
}

interface Reranker {
  rerank(question: string, candidates: Candidate[], topN: number): Candidate[];
}

// --- Deterministic mock embedder (matches the Python sibling) -----------------

class HashEmbedder implements Embedder {
  embed(text: string): number[] {
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

// --- Offline reranker stand-in -------------------------------------------------

class KeywordOverlapReranker implements Reranker {
  rerank(question: string, candidates: Candidate[], topN: number): Candidate[] {
    const terms = new Set(
      question
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2),
    );
    for (const c of candidates) {
      const words = new Set(c.text.toLowerCase().split(/\s+/));
      let overlap = 0;
      for (const t of terms) if (words.has(t)) overlap++;
      c.rerankScore = terms.size ? overlap / terms.size : 0;
    }
    return [...candidates].sort((a, b) => b.rerankScore - a.rerankScore).slice(0, topN);
  }
}

// --- In-memory hybrid index ------------------------------------------------------

class HybridIndex {
  private items: Array<{ id: string; embedding: number[]; text: string; metadata: Record<string, unknown> }> = [];

  add(id: string, embedding: number[], text: string, metadata: Record<string, unknown>): void {
    this.items.push({ id, embedding, text, metadata });
  }

  private candidate(item: (typeof this.items)[number]): Candidate {
    return {
      id: item.id,
      text: item.text,
      denseScore: 0,
      sparseScore: 0,
      fusedScore: 0,
      rerankScore: 0,
      metadata: item.metadata,
    };
  }

  denseSearch(embedding: number[], topK: number): Candidate[] {
    const dot = (a: number[], b: number[]): number => a.reduce((sum, x, i) => sum + x * b[i], 0);
    return this.items
      .map((item) => ({ ...this.candidate(item), denseScore: dot(embedding, item.embedding) }))
      .sort((a, b) => b.denseScore - a.denseScore)
      .slice(0, topK);
  }

  sparseSearch(query: string, topK: number): Candidate[] {
    const terms = new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2),
    );
    return this.items
      .map((item) => {
        const words = new Set(item.text.toLowerCase().split(/\s+/));
        let overlap = 0;
        for (const t of terms) if (words.has(t)) overlap++;
        return { ...this.candidate(item), sparseScore: terms.size ? overlap / terms.size : 0 };
      })
      .sort((a, b) => b.sparseScore - a.sparseScore)
      .slice(0, topK);
  }
}

function reciprocalRankFusion(dense: Candidate[], sparse: Candidate[], k = 60): Candidate[] {
  // Summed reciprocal rank needs no score calibration, which is why RRF is
  // the default fusion for hybrid retrieval.
  const fused = new Map<string, Candidate>();
  for (const ranked of [dense, sparse]) {
    ranked.forEach((cand, rank) => {
      const slot = fused.get(cand.id) ?? cand;
      slot.fusedScore += 1 / (k + rank + 1);
      if (cand.denseScore) slot.denseScore = cand.denseScore;
      if (cand.sparseScore) slot.sparseScore = cand.sparseScore;
      fused.set(cand.id, slot);
    });
  }
  return [...fused.values()].sort((a, b) => b.fusedScore - a.fusedScore);
}

// --- Pipeline ---------------------------------------------------------------------

interface AgenticRAGOptions {
  retrieveK: number;
  rerankN: number;
  maxAttempts: number;
  sufficiencyThreshold: number;
}

class AgenticRAGPipeline {
  private index = new HybridIndex();

  constructor(
    private readonly embedder: Embedder,
    private readonly reranker: Reranker,
    private readonly model = anthropic("claude-haiku-4-5"),
    private readonly opts: AgenticRAGOptions = {
      retrieveK: 8,
      rerankN: 3,
      maxAttempts: 2,
      sufficiencyThreshold: 0.3,
    },
  ) {}

  ingest(documents: string[]): number {
    documents.forEach((doc, i) => {
      this.index.add(`doc_${i}`, this.embedder.embed(doc), doc, {});
    });
    return documents.length;
  }

  retrieve(question: string): { evidence: Candidate[]; attempts: number } {
    let current = question;
    let evidence: Candidate[] = [];
    for (let attempt = 1; attempt <= this.opts.maxAttempts; attempt++) {
      const dense = this.index.denseSearch(this.embedder.embed(current), this.opts.retrieveK);
      const sparse = this.index.sparseSearch(current, this.opts.retrieveK);
      const fused = reciprocalRankFusion(dense, sparse);
      evidence = this.reranker.rerank(question, fused, this.opts.rerankN);
      if (this.sufficient(evidence) || attempt === this.opts.maxAttempts) {
        return { evidence, attempts: attempt };
      }
      // Insufficient evidence: a production loop asks the sufficiency
      // reflector what is missing; the demo widens the query mechanically.
      current = `${question} background definition details`;
    }
    return { evidence, attempts: this.opts.maxAttempts };
  }

  private sufficient(evidence: Candidate[]): boolean {
    return evidence.length > 0 && evidence[0].rerankScore >= this.opts.sufficiencyThreshold;
  }

  async query(question: string): Promise<AgenticRAGResult> {
    const { evidence, attempts } = this.retrieve(question);
    const context = evidence.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n");
    const prompt =
      `Answer the question using only the numbered sources. Cite the source ` +
      `number for every claim. If the sources do not contain the answer, say ` +
      `so plainly.\n\nSources:\n${context}\n\nQuestion: ${question}`;

    const result = await generateText({ model: this.model, prompt });
    return { answer: result.text, evidence, attempts, grounded: this.sufficient(evidence) };
  }
}

// --- Smoke runner ---------------------------------------------------------------

const SEED_DOCUMENTS = [
  "ReAct is a prompting technique that combines chain-of-thought reasoning with action execution.",
  "RAG stands for Retrieval-Augmented Generation. It retrieves relevant documents before generating.",
  "Hybrid retrieval fuses dense embedding search with sparse keyword search using reciprocal rank fusion.",
  "A reranker re-scores retrieved candidates against the question before the model sees them.",
];

const QUESTION = "How does hybrid retrieval with reranking work?";

async function main(): Promise<void> {
  const pipeline = new AgenticRAGPipeline(new HashEmbedder(), new KeywordOverlapReranker());
  const n = pipeline.ingest(SEED_DOCUMENTS);
  console.log(`Ingested ${n} documents`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Skipping generate — set ANTHROPIC_API_KEY to exercise the real model call.");
    const { evidence, attempts } = pipeline.retrieve(QUESTION);
    console.log(`Evidence: ${evidence.length} chunks after ${attempts} attempt(s) (offline).`);
    for (const c of evidence) {
      console.log(`  fused=${c.fusedScore.toFixed(4)} rerank=${c.rerankScore.toFixed(2)} ${c.text.slice(0, 60)}`);
    }
    return;
  }

  const result = await pipeline.query(QUESTION);
  console.log(`Evidence: ${result.evidence.length} chunks after ${result.attempts} attempt(s)`);
  console.log(`Answer: ${result.answer.slice(0, 120)}`);
}

// ESM entry-point check.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { AgenticRAGPipeline, HybridIndex, HashEmbedder, KeywordOverlapReranker, reciprocalRankFusion };
export type { Candidate, AgenticRAGResult, Embedder, Reranker, AgenticRAGOptions };
