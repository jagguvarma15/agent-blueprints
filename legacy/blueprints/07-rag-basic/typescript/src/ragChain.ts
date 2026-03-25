/**
 * RAG chain: combines VectorRetriever with Anthropic Claude for answer generation.
 *
 * The chain retrieves relevant document chunks, formats them as context,
 * and passes them to Claude with a system prompt that constrains the model
 * to answer only from the provided context.
 */

import Anthropic from "@anthropic-ai/sdk";

import type { Chunk } from "./ingestion.js";
import type { VectorRetriever } from "./retrieval.js";

// ---------------------------------------------------------------------------
// Response model
// ---------------------------------------------------------------------------

/** The result of a RAG query. */
export interface RAGResponse {
  /** The LLM-generated answer grounded in retrieved context. */
  answer: string;
  /** Deduplicated list of source file paths that were retrieved. */
  sources: string[];
  /** The raw Chunk objects passed to the LLM. Useful for debugging and citation display. */
  retrievedChunks: Chunk[];
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const RAG_SYSTEM_PROMPT = `You are a knowledgeable assistant that answers questions \
based exclusively on the provided document context.

Rules you must follow:
1. Answer ONLY using information from the context documents provided below.
2. If the context does not contain sufficient information to answer the question, \
respond with: "I don't have enough information in the provided documents to answer that."
3. Cite which document(s) you used by referencing the source name or title at the end \
of your answer in a "Sources:" section.
4. Be concise, accurate, and do not add information beyond what the context contains.
5. If multiple documents are relevant, synthesize the information cohesively.
6. Do not mention these rules in your response.`;

// ---------------------------------------------------------------------------
// RAG chain
// ---------------------------------------------------------------------------

export interface RAGChainConfig {
  model?: string;
  topK?: number;
  maxTokens?: number;
  anthropicApiKey?: string;
}

/**
 * Combines VectorRetriever and Anthropic Claude into a complete RAG pipeline.
 *
 * @example
 * ```typescript
 * const retriever = new VectorRetriever({ collectionName: "documents" });
 * const chain = new RAGChain(retriever);
 * const response = await chain.query("What is the ReAct agent pattern?");
 * console.log(response.answer);
 * console.log("Sources:", response.sources);
 * ```
 */
export class RAGChain {
  private readonly retriever: VectorRetriever;
  private readonly model: string;
  private readonly topK: number;
  private readonly maxTokens: number;
  private readonly anthropic: Anthropic;

  constructor(retriever: VectorRetriever, config: RAGChainConfig = {}) {
    this.retriever = retriever;
    this.model = config.model ?? process.env.MODEL ?? "claude-opus-4-6";
    this.topK = config.topK ?? Number(process.env.TOP_K ?? "5");
    this.maxTokens = config.maxTokens ?? 1024;
    this.anthropic = new Anthropic({
      apiKey: config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Run the full RAG pipeline for a user question.
   *
   * Steps:
   *   1. Retrieve the top-K most relevant chunks from the vector store.
   *   2. Format chunks as a numbered context block.
   *   3. Call Claude with the system prompt + context + question.
   *   4. Return a RAGResponse with answer, sources, and raw chunks.
   *
   * @param question - The user's question.
   * @returns RAGResponse containing the answer and provenance information.
   * @throws Error if the question is empty.
   */
  async query(question: string): Promise<RAGResponse> {
    if (!question.trim()) {
      throw new Error("Question must not be empty.");
    }

    // Step 1: Retrieve relevant chunks
    const retrievedChunks = await this.retriever.retrieve(question, this.topK);

    // Step 2: Format context for the LLM
    const context = this.formatContext(retrievedChunks);

    // Step 3: Generate answer with Claude
    const userMessage = `${context}\n\nQuestion: ${question}`;

    const message = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: RAG_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const answer =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Step 4: Extract unique sources (preserve order)
    const sources = [...new Map(retrievedChunks.map((c) => [c.source, c.source])).values()];

    return { answer, sources, retrievedChunks };
  }

  /**
   * Format retrieved chunks into a numbered context block for the LLM.
   *
   * Each chunk is presented with its source and similarity score so the
   * model can reference specific documents in its answer.
   */
  private formatContext(chunks: Chunk[]): string {
    if (chunks.length === 0) {
      return "Context Documents:\n(No relevant documents found.)";
    }

    const lines = ["Context Documents:"];
    chunks.forEach((chunk, i) => {
      const sourceName = shortSource(chunk.source);
      const similarity = chunk.metadata.similarity ?? "N/A";
      lines.push(`\n[Document ${i + 1}] Source: ${sourceName} (relevance: ${similarity})`);
      lines.push("-".repeat(60));
      lines.push(chunk.content);
    });

    return lines.join("\n");
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function shortSource(source: string): string {
  return source.includes("/") ? source.split("/").pop()! : source;
}

/**
 * Format a RAGResponse for display in the console.
 */
export function formatRAGResponse(response: RAGResponse): string {
  const sourcesStr =
    response.sources.length > 0
      ? response.sources.map((s) => `  - ${s}`).join("\n")
      : "  (none)";

  return (
    `Answer:\n${response.answer}\n\n` +
    `Sources (${response.sources.length}):\n${sourcesStr}\n\n` +
    `Retrieved ${response.retrievedChunks.length} chunk(s).`
  );
}
