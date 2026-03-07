/**
 * Vector retrieval for the RAG Basic blueprint.
 *
 * Embeds a query using the same model used during ingestion, performs a
 * cosine-similarity search in ChromaDB, and returns hydrated Chunk objects
 * with similarity scores.
 */

import Anthropic from "@anthropic-ai/sdk";
import { ChromaClient, Collection } from "chromadb";

import type { Chunk } from "./ingestion.js";

export interface RetrieverConfig {
  collectionName?: string;
  chromaHost?: string;
  chromaPort?: number;
  anthropicApiKey?: string;
}

/**
 * Retrieves the most relevant document chunks for a given query.
 *
 * Uses Anthropic's voyage-3 embedding model for query embedding and
 * ChromaDB for approximate nearest-neighbor search.
 *
 * @example
 * ```typescript
 * const retriever = new VectorRetriever({ collectionName: "documents" });
 * const chunks = await retriever.retrieve("What is RAG?", 5);
 * for (const chunk of chunks) {
 *   console.log(`[${chunk.metadata.similarity}] ${chunk.source}`);
 *   console.log(chunk.content.slice(0, 200));
 * }
 * ```
 */
export class VectorRetriever {
  private readonly anthropic: Anthropic;
  private readonly chroma: ChromaClient;
  private readonly collectionName: string;
  private collection: Collection | null = null;

  constructor(config: RetrieverConfig = {}) {
    this.collectionName = config.collectionName ?? process.env.COLLECTION_NAME ?? "documents";

    const host = config.chromaHost ?? process.env.CHROMA_HOST ?? "localhost";
    const port = config.chromaPort ?? Number(process.env.CHROMA_PORT ?? "8000");

    this.anthropic = new Anthropic({
      apiKey: config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    this.chroma = new ChromaClient({ path: `http://${host}:${port}` });
  }

  /** Lazily initialize and cache the ChromaDB collection. */
  private async getCollection(): Promise<Collection> {
    if (!this.collection) {
      this.collection = await this.chroma.getOrCreateCollection({
        name: this.collectionName,
        metadata: { "hnsw:space": "cosine" },
      });
    }
    return this.collection;
  }

  /**
   * Embed the query and return the top-K most similar chunks.
   *
   * @param query - The user's question or search string.
   * @param topK - Number of chunks to return. More chunks provide richer
   *               context but increase token cost and may introduce noise.
   * @returns Array of Chunk objects sorted by descending similarity score.
   *          Each chunk's `metadata` contains a `similarity` key in [0, 1].
   * @throws Error if the query is empty or the collection has no documents.
   */
  async retrieve(query: string, topK: number = 5): Promise<Chunk[]> {
    if (!query.trim()) {
      throw new Error("Query must not be empty.");
    }

    const collection = await this.getCollection();
    const count = await collection.count();

    if (count === 0) {
      throw new Error(
        `Collection '${this.collectionName}' is empty. ` +
          "Run ingestion before querying."
      );
    }

    // Clamp topK to available documents
    const effectiveTopK = Math.min(topK, count);

    // Embed the query using the same model as ingestion
    const embedResponse = await this.anthropic.embeddings.create({
      model: "voyage-3",
      input: [query],
    });
    const queryEmbedding = embedResponse.data[0].embedding;

    // Perform vector similarity search in ChromaDB
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: effectiveTopK,
      include: ["documents", "metadatas", "distances"] as any,
    });

    // ChromaDB returns lists-of-lists (one per query); we have one query
    const ids = results.ids[0] ?? [];
    const documents = results.documents[0] ?? [];
    const metadatas = results.metadatas[0] ?? [];
    // In cosine space: distance = 1 - similarity
    const distances = (results.distances?.[0] ?? []) as number[];

    const chunks: Chunk[] = ids.map((id, i) => {
      const similarity = 1 - (distances[i] ?? 0);
      return {
        id,
        content: documents[i] ?? "",
        source: String(metadatas[i]?.source ?? "unknown"),
        metadata: {
          ...(metadatas[i] as Record<string, string | number | boolean>),
          similarity: Math.round(similarity * 10000) / 10000,
        },
      };
    });

    return chunks;
  }

  /**
   * Return basic statistics about the collection.
   */
  async getCollectionStats(): Promise<{ collectionName: string; totalChunks: number }> {
    const collection = await this.getCollection();
    const count = await collection.count();
    return {
      collectionName: this.collectionName,
      totalChunks: count,
    };
  }
}
