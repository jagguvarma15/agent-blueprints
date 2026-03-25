/**
 * Document ingestion pipeline for RAG Basic blueprint.
 *
 * Handles loading documents from disk, splitting them into chunks,
 * generating embeddings via Anthropic's API, and storing them in ChromaDB.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { ChromaClient, Collection } from "chromadb";

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/** A raw document loaded from disk before chunking. */
export interface Document {
  id: string;
  content: string;
  source: string; // Absolute file path or URL
  metadata: Record<string, string | number | boolean>;
}

/** A positional sub-section of a Document, ready for embedding and storage. */
export interface Chunk {
  id: string;
  content: string;
  source: string; // Inherited from parent Document
  metadata: Record<string, string | number | boolean>;
  embedding?: number[]; // Populated after embedAndStore()
}

type EmbeddingsApi = {
  embeddings: {
    create(args: {
      model: string;
      input: string[];
    }): Promise<{ data: Array<{ embedding: number[] }> }>;
  };
};

// ---------------------------------------------------------------------------
// Document loading
// ---------------------------------------------------------------------------

const SUPPORTED_EXTENSIONS = new Set([".txt", ".md"]);

/**
 * Load a single file into a Document.
 */
function loadFile(filePath: string): Document {
  const resolvedPath = path.resolve(filePath);
  const content = fs.readFileSync(resolvedPath, "utf-8");
  const ext = path.extname(resolvedPath);
  const id = crypto
    .createHash("sha256")
    .update(resolvedPath)
    .digest("hex")
    .slice(0, 16);

  return {
    id,
    content,
    source: resolvedPath,
    metadata: {
      title: path.basename(resolvedPath, ext),
      fileType: ext.replace(".", ""),
      charCount: content.length,
      fileName: path.basename(resolvedPath),
    },
  };
}

/**
 * Recursively collect all supported files under a directory.
 */
function collectFiles(dirPath: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results.sort();
}

// ---------------------------------------------------------------------------
// Ingestion pipeline
// ---------------------------------------------------------------------------

export interface IngesterConfig {
  anthropicApiKey?: string;
  chromaHost?: string;
  chromaPort?: number;
}

/**
 * Orchestrates the ingestion pipeline:
 *
 *   Documents → Chunks → Embeddings → ChromaDB
 *
 * @example
 * ```typescript
 * const ingester = new DocumentIngester();
 * const docs = await ingester.loadDocuments("data/");
 * const chunks = ingester.chunkDocuments(docs, { chunkSize: 500, overlap: 50 });
 * await ingester.embedAndStore(chunks, "documents");
 * ```
 */
export class DocumentIngester {
  private readonly anthropic: Anthropic & EmbeddingsApi;
  private readonly chroma: ChromaClient;

  constructor(config: IngesterConfig = {}) {
    this.anthropic = new Anthropic({
      apiKey: config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY,
    }) as Anthropic & EmbeddingsApi;

    const host = config.chromaHost ?? process.env.CHROMA_HOST ?? "localhost";
    const port = config.chromaPort ?? Number(process.env.CHROMA_PORT ?? "8000");
    this.chroma = new ChromaClient({ path: `http://${host}:${port}` });
  }

  /**
   * Load all supported documents from a file or directory.
   *
   * @param inputPath - Path to a file or directory.
   * @returns Array of Document objects.
   * @throws Error if path does not exist or no supported files are found.
   */
  loadDocuments(inputPath: string): Document[] {
    const resolvedPath = path.resolve(inputPath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Path does not exist: ${resolvedPath}`);
    }

    const stat = fs.statSync(resolvedPath);
    let filePaths: string[];

    if (stat.isFile()) {
      const ext = path.extname(resolvedPath);
      filePaths = SUPPORTED_EXTENSIONS.has(ext) ? [resolvedPath] : [];
    } else {
      filePaths = collectFiles(resolvedPath);
    }

    if (filePaths.length === 0) {
      throw new Error(
        `No supported files found at ${resolvedPath}. ` +
          `Supported extensions: ${[...SUPPORTED_EXTENSIONS].join(", ")}`
      );
    }

    const documents: Document[] = [];
    for (const filePath of filePaths) {
      try {
        const doc = loadFile(filePath);
        documents.push(doc);
        console.log(`  Loaded: ${path.basename(filePath)} (${doc.metadata.charCount.toLocaleString()} chars)`);
      } catch (err) {
        console.warn(`  Warning: Could not load ${filePath}: ${err}`);
      }
    }

    console.log(`Loaded ${documents.length} document(s).`);
    return documents;
  }

  // ------------------------------------------------------------------
  // Chunking
  // ------------------------------------------------------------------

  /**
   * Split documents into overlapping text chunks.
   *
   * Uses a sliding window with configurable size and overlap. Prefers to
   * split at paragraph or sentence boundaries to avoid cutting mid-sentence.
   *
   * @param docs - Documents to chunk.
   * @param options - Chunk size and overlap configuration.
   * @returns Array of Chunk objects with positional metadata.
   */
  chunkDocuments(
    docs: Document[],
    options: { chunkSize?: number; overlap?: number } = {}
  ): Chunk[] {
    const chunkSize = options.chunkSize ?? 500;
    const overlap = options.overlap ?? 50;

    if (chunkSize <= 0) throw new Error(`chunkSize must be positive, got ${chunkSize}`);
    if (overlap < 0) throw new Error(`overlap must be non-negative, got ${overlap}`);
    if (overlap >= chunkSize) {
      throw new Error(`overlap (${overlap}) must be less than chunkSize (${chunkSize})`);
    }

    const allChunks: Chunk[] = [];

    for (const doc of docs) {
      const splits = splitText(doc.content, chunkSize, overlap);
      const total = splits.length;

      splits.forEach(({ text, charStart, charEnd }, idx) => {
        const chunk: Chunk = {
          id: `${doc.id}_chunk_${String(idx).padStart(4, "0")}`,
          content: text,
          source: doc.source,
          metadata: {
            ...doc.metadata,
            chunkIndex: idx,
            totalChunks: total,
            charStart,
            charEnd,
          },
        };
        allChunks.push(chunk);
      });
    }

    console.log(
      `Created ${allChunks.length} chunk(s) from ${docs.length} document(s) ` +
        `(chunkSize=${chunkSize}, overlap=${overlap}).`
    );
    return allChunks;
  }

  // ------------------------------------------------------------------
  // Embedding and storage
  // ------------------------------------------------------------------

  /**
   * Generate embeddings for each chunk and upsert into ChromaDB.
   *
   * Processes chunks in batches to respect API limits. Existing chunks with
   * the same ID are overwritten (upsert semantics).
   *
   * @param chunks - Chunks to embed and store.
   * @param collectionName - Name of the ChromaDB collection.
   * @param batchSize - Number of chunks per embedding API call.
   */
  async embedAndStore(
    chunks: Chunk[],
    collectionName: string = "documents",
    batchSize: number = 96
  ): Promise<void> {
    if (chunks.length === 0) {
      console.log("No chunks to store.");
      return;
    }

    const collection: Collection = await this.chroma.getOrCreateCollection({
      name: collectionName,
      metadata: { "hnsw:space": "cosine" },
    });

    const totalBatches = Math.ceil(chunks.length / batchSize);

    for (let batchStart = 0; batchStart < chunks.length; batchStart += batchSize) {
      const batch = chunks.slice(batchStart, batchStart + batchSize);
      const currentBatch = Math.floor(batchStart / batchSize) + 1;
      console.log(
        `  Embedding batch ${currentBatch}/${totalBatches} (${batch.length} chunks)...`
      );

      const texts = batch.map((c) => c.content);

      // Generate embeddings via Anthropic voyage-3
      const response = await this.anthropic.embeddings.create({
        model: "voyage-3",
        input: texts,
      });

      const embeddings = response.data.map((item) => item.embedding);

      // Store embedding on chunk object for inspection
      batch.forEach((chunk, i) => {
        chunk.embedding = embeddings[i];
      });

      // Upsert into ChromaDB
      await collection.upsert({
        ids: batch.map((c) => c.id),
        embeddings,
        documents: texts,
        metadatas: batch.map((c) =>
          // ChromaDB metadata values must be string | number | boolean
          Object.fromEntries(
            Object.entries(c.metadata).map(([k, v]) => [
              k,
              typeof v === "object" ? JSON.stringify(v) : v,
            ])
          )
        ),
      });
    }

    console.log(`Stored ${chunks.length} chunk(s) in ChromaDB collection '${collectionName}'.`);
  }
}

// ---------------------------------------------------------------------------
// Text splitting utilities
// ---------------------------------------------------------------------------

interface TextSplit {
  text: string;
  charStart: number;
  charEnd: number;
}

/**
 * Split text into overlapping windows, preferring natural boundaries.
 */
function splitText(text: string, chunkSize: number, overlap: number): TextSplit[] {
  if (!text.trim()) return [];

  const splits: TextSplit[] = [];
  const step = chunkSize - overlap;
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    // Try to find a natural break near the end of this window
    if (end < text.length) {
      const naturalEnd = findBreak(text, start, end);
      if (naturalEnd !== null) {
        end = naturalEnd;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk) {
      splits.push({ text: chunk, charStart: start, charEnd: end });
    }

    start += step;

    if (end >= text.length) break;
  }

  return splits;
}

/**
 * Find the best split position within [start, end] by searching backwards
 * for a paragraph break, sentence boundary, or any whitespace.
 */
function findBreak(text: string, start: number, end: number): number | null {
  const window = text.slice(start, end);

  // Prefer paragraph break (double newline)
  const paraMatches = [...window.matchAll(/\n\n+/g)];
  if (paraMatches.length > 0) {
    const last = paraMatches[paraMatches.length - 1];
    return start + (last.index ?? 0) + last[0].length;
  }

  // Sentence-ending punctuation followed by whitespace
  const sentenceMatches = [...window.matchAll(/[.!?]\s+/g)];
  if (sentenceMatches.length > 0) {
    const last = sentenceMatches[sentenceMatches.length - 1];
    return start + (last.index ?? 0) + last[0].length;
  }

  // Any whitespace near the end
  const reversed = window.split("").reverse().join("");
  const wsMatch = reversed.match(/\s/);
  if (wsMatch && wsMatch.index !== undefined) {
    return end - wsMatch.index;
  }

  return null;
}
