/**
 * Tests for Blueprint 07: RAG Basic (TypeScript).
 *
 * Uses vitest with vi.mock() to patch ChromaDB and Anthropic so tests run
 * without external services or API keys. Covers:
 *
 *   - Document loading (from temp files)
 *   - Text chunking (size, overlap, edge cases)
 *   - embedAndStore (verifies ChromaDB upsert is called correctly)
 *   - VectorRetriever (verifies embedding + similarity search + Chunk hydration)
 *   - RAGChain (mocks retriever, verifies Claude is called with context)
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Environment setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key-placeholder";
  process.env.CHROMA_HOST = "localhost";
  process.env.CHROMA_PORT = "8000";
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rag-test-"));
}

function writeFile(dir: string, name: string, content: string): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

function makeEmbeddingResponse(texts: string[], dims = 8) {
  return {
    data: texts.map((_, i) => ({
      embedding: Array.from({ length: dims }, (_, d) => (i * dims + d) / (dims * texts.length)),
    })),
  };
}

// ---------------------------------------------------------------------------
// Tests: Document loading
// ---------------------------------------------------------------------------

describe("DocumentIngester.loadDocuments", () => {
  it("loads a single .txt file", async () => {
    // Mock Anthropic and ChromaDB constructors before importing
    vi.mock("@anthropic-ai/sdk", () => ({
      default: vi.fn(() => ({ embeddings: { create: vi.fn() } })),
    }));
    vi.mock("chromadb", () => ({
      ChromaClient: vi.fn(() => ({ getOrCreateCollection: vi.fn() })),
    }));

    const { DocumentIngester } = await import("../src/ingestion.js");
    const tmpDir = makeTempDir();
    const filePath = writeFile(tmpDir, "test.txt", "Hello, world!\nThis is test content.");

    const ingester = new DocumentIngester();
    const docs = ingester.loadDocuments(filePath);

    expect(docs).toHaveLength(1);
    expect(docs[0].source).toBe(path.resolve(filePath));
    expect(docs[0].content).toContain("Hello, world!");
    expect(docs[0].metadata.fileType).toBe("txt");
    expect(docs[0].metadata.charCount).toBeGreaterThan(0);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("recursively loads .txt and .md files from a directory", async () => {
    vi.mock("@anthropic-ai/sdk", () => ({
      default: vi.fn(() => ({ embeddings: { create: vi.fn() } })),
    }));
    vi.mock("chromadb", () => ({
      ChromaClient: vi.fn(() => ({ getOrCreateCollection: vi.fn() })),
    }));

    const { DocumentIngester } = await import("../src/ingestion.js");
    const tmpDir = makeTempDir();
    writeFile(tmpDir, "doc1.txt", "Content of doc 1.");
    writeFile(tmpDir, "doc2.md", "# Doc 2\nContent of doc 2.");
    writeFile(tmpDir, "ignored.json", '{"key":"value"}');

    const ingester = new DocumentIngester();
    const docs = ingester.loadDocuments(tmpDir);

    expect(docs).toHaveLength(2);
    const fileNames = docs.map((d) => path.basename(d.source));
    expect(fileNames).toContain("doc1.txt");
    expect(fileNames).toContain("doc2.md");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("throws FileNotFoundError for non-existent path", async () => {
    vi.mock("@anthropic-ai/sdk", () => ({
      default: vi.fn(() => ({ embeddings: { create: vi.fn() } })),
    }));
    vi.mock("chromadb", () => ({
      ChromaClient: vi.fn(() => ({ getOrCreateCollection: vi.fn() })),
    }));

    const { DocumentIngester } = await import("../src/ingestion.js");
    const ingester = new DocumentIngester();

    expect(() => ingester.loadDocuments("/tmp/nonexistent_rag_blueprint_07")).toThrow(
      "does not exist"
    );
  });

  it("throws when no supported files found", async () => {
    vi.mock("@anthropic-ai/sdk", () => ({
      default: vi.fn(() => ({ embeddings: { create: vi.fn() } })),
    }));
    vi.mock("chromadb", () => ({
      ChromaClient: vi.fn(() => ({ getOrCreateCollection: vi.fn() })),
    }));

    const { DocumentIngester } = await import("../src/ingestion.js");
    const tmpDir = makeTempDir();
    writeFile(tmpDir, "data.json", "{}");

    const ingester = new DocumentIngester();

    expect(() => ingester.loadDocuments(tmpDir)).toThrow("No supported files");

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// Tests: Chunking
// ---------------------------------------------------------------------------

describe("DocumentIngester.chunkDocuments", () => {
  async function makeIngester() {
    vi.mock("@anthropic-ai/sdk", () => ({
      default: vi.fn(() => ({ embeddings: { create: vi.fn() } })),
    }));
    vi.mock("chromadb", () => ({
      ChromaClient: vi.fn(() => ({ getOrCreateCollection: vi.fn() })),
    }));
    const { DocumentIngester } = await import("../src/ingestion.js");
    return new DocumentIngester();
  }

  function makeDoc(content: string) {
    return {
      id: "test_doc",
      content,
      source: "/tmp/test.txt",
      metadata: { title: "Test", fileType: "txt", charCount: content.length, fileName: "test.txt" },
    };
  }

  it("produces multiple chunks for long text", async () => {
    const ingester = await makeIngester();
    const doc = makeDoc("Word sentence. ".repeat(50)); // ~750 chars
    const chunks = ingester.chunkDocuments([doc], { chunkSize: 200, overlap: 20 });

    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("chunk metadata is correctly populated", async () => {
    const ingester = await makeIngester();
    const tmpDir = makeTempDir();
    const filePath = writeFile(tmpDir, "meta.txt", "Alpha beta gamma. ".repeat(30));

    const { DocumentIngester: DI2 } = await import("../src/ingestion.js");
    const ingester2 = new DI2();
    const docs = ingester2.loadDocuments(filePath);
    const chunks = ingester2.chunkDocuments(docs, { chunkSize: 100, overlap: 10 });

    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach((chunk, i) => {
      expect(chunk.metadata.chunkIndex).toBe(i);
      expect(chunk.metadata.totalChunks).toBe(chunks.length);
      expect(chunk.metadata).toHaveProperty("charStart");
      expect(chunk.metadata).toHaveProperty("charEnd");
      expect(chunk.source).toBe(path.resolve(filePath));
    });

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("chunk IDs are unique", async () => {
    const ingester = await makeIngester();
    const doc = makeDoc("Some text to chunk. ".repeat(40));
    const chunks = ingester.chunkDocuments([doc], { chunkSize: 100, overlap: 10 });

    const ids = chunks.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("empty content produces no chunks", async () => {
    const ingester = await makeIngester();
    const doc = makeDoc("   \n\n   ");
    const chunks = ingester.chunkDocuments([doc]);

    expect(chunks).toHaveLength(0);
  });

  it("throws for chunkSize <= 0", async () => {
    const ingester = await makeIngester();
    const doc = makeDoc("some content");

    expect(() => ingester.chunkDocuments([doc], { chunkSize: 0 })).toThrow(
      "chunkSize must be positive"
    );
  });

  it("throws when overlap >= chunkSize", async () => {
    const ingester = await makeIngester();
    const doc = makeDoc("some content here");

    expect(() =>
      ingester.chunkDocuments([doc], { chunkSize: 100, overlap: 100 })
    ).toThrow("overlap");
  });
});

// ---------------------------------------------------------------------------
// Tests: embedAndStore
// ---------------------------------------------------------------------------

describe("DocumentIngester.embedAndStore", () => {
  it("calls collection.upsert with correct data", async () => {
    const mockUpsert = vi.fn().mockResolvedValue(undefined);
    const mockGetOrCreate = vi.fn().mockResolvedValue({ upsert: mockUpsert });

    vi.mock("chromadb", () => ({
      ChromaClient: vi.fn(() => ({ getOrCreateCollection: mockGetOrCreate })),
    }));

    const mockEmbeddingsCreate = vi
      .fn()
      .mockResolvedValue(makeEmbeddingResponse(["chunk 1", "chunk 2"]));
    vi.mock("@anthropic-ai/sdk", () => ({
      default: vi.fn(() => ({ embeddings: { create: mockEmbeddingsCreate } })),
    }));

    const { DocumentIngester } = await import("../src/ingestion.js");
    const ingester = new DocumentIngester();

    const chunks = [
      {
        id: "doc_chunk_0000",
        content: "chunk 1",
        source: "/test.txt",
        metadata: { title: "Test", fileType: "txt", charCount: 7, fileName: "test.txt" },
      },
      {
        id: "doc_chunk_0001",
        content: "chunk 2",
        source: "/test.txt",
        metadata: { title: "Test", fileType: "txt", charCount: 7, fileName: "test.txt" },
      },
    ];

    await ingester.embedAndStore(chunks, "test_collection");

    expect(mockEmbeddingsCreate).toHaveBeenCalledOnce();
    expect(mockUpsert).toHaveBeenCalledOnce();

    const upsertArgs = mockUpsert.mock.calls[0][0];
    expect(upsertArgs.ids).toEqual(["doc_chunk_0000", "doc_chunk_0001"]);
    expect(upsertArgs.documents).toEqual(["chunk 1", "chunk 2"]);
    expect(upsertArgs.embeddings).toHaveLength(2);
  });

  it("skips API calls when chunks list is empty", async () => {
    const mockEmbeddingsCreate = vi.fn();
    const mockUpsert = vi.fn();
    const mockGetOrCreate = vi.fn().mockResolvedValue({ upsert: mockUpsert });

    vi.mock("chromadb", () => ({
      ChromaClient: vi.fn(() => ({ getOrCreateCollection: mockGetOrCreate })),
    }));
    vi.mock("@anthropic-ai/sdk", () => ({
      default: vi.fn(() => ({ embeddings: { create: mockEmbeddingsCreate } })),
    }));

    const { DocumentIngester } = await import("../src/ingestion.js");
    const ingester = new DocumentIngester();

    await ingester.embedAndStore([], "test");

    expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: VectorRetriever
// ---------------------------------------------------------------------------

describe("VectorRetriever", () => {
  it("returns hydrated Chunk objects with similarity scores", async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      ids: [["chunk_0", "chunk_1"]],
      documents: [["First chunk text.", "Second chunk text."]],
      metadatas: [
        [
          { source: "/doc1.txt", chunkIndex: 0 },
          { source: "/doc2.txt", chunkIndex: 0 },
        ],
      ],
      distances: [[0.1, 0.3]],
    });
    const mockCount = vi.fn().mockResolvedValue(10);
    const mockGetOrCreate = vi
      .fn()
      .mockResolvedValue({ query: mockQuery, count: mockCount });

    vi.mock("chromadb", () => ({
      ChromaClient: vi.fn(() => ({ getOrCreateCollection: mockGetOrCreate })),
    }));

    const mockEmbeddingsCreate = vi
      .fn()
      .mockResolvedValue(makeEmbeddingResponse(["test query"]));
    vi.mock("@anthropic-ai/sdk", () => ({
      default: vi.fn(() => ({ embeddings: { create: mockEmbeddingsCreate } })),
    }));

    const { VectorRetriever } = await import("../src/retrieval.js");
    const retriever = new VectorRetriever({ collectionName: "test" });
    const chunks = await retriever.retrieve("test query", 2);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].id).toBe("chunk_0");
    expect(chunks[0].content).toBe("First chunk text.");
    expect(chunks[0].source).toBe("/doc1.txt");
    // similarity = 1 - 0.1 = 0.9
    expect(chunks[0].metadata.similarity).toBeCloseTo(0.9, 3);
    expect(chunks[1].metadata.similarity).toBeCloseTo(0.7, 3);
  });

  it("throws for empty query", async () => {
    const mockCount = vi.fn().mockResolvedValue(5);
    const mockGetOrCreate = vi
      .fn()
      .mockResolvedValue({ count: mockCount });

    vi.mock("chromadb", () => ({
      ChromaClient: vi.fn(() => ({ getOrCreateCollection: mockGetOrCreate })),
    }));
    vi.mock("@anthropic-ai/sdk", () => ({
      default: vi.fn(() => ({ embeddings: { create: vi.fn() } })),
    }));

    const { VectorRetriever } = await import("../src/retrieval.js");
    const retriever = new VectorRetriever({ collectionName: "test" });

    await expect(retriever.retrieve("   ")).rejects.toThrow("Query must not be empty");
  });

  it("throws when collection is empty", async () => {
    const mockCount = vi.fn().mockResolvedValue(0);
    const mockGetOrCreate = vi.fn().mockResolvedValue({ count: mockCount });

    vi.mock("chromadb", () => ({
      ChromaClient: vi.fn(() => ({ getOrCreateCollection: mockGetOrCreate })),
    }));
    vi.mock("@anthropic-ai/sdk", () => ({
      default: vi.fn(() => ({ embeddings: { create: vi.fn() } })),
    }));

    const { VectorRetriever } = await import("../src/retrieval.js");
    const retriever = new VectorRetriever({ collectionName: "test" });

    await expect(retriever.retrieve("some question")).rejects.toThrow("empty");
  });

  it("clamps topK to collection size", async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      ids: [["c1", "c2", "c3"]],
      documents: [["a", "b", "c"]],
      metadatas: [[{ source: "/f.txt" }, { source: "/f.txt" }, { source: "/f.txt" }]],
      distances: [[0.1, 0.2, 0.3]],
    });
    const mockCount = vi.fn().mockResolvedValue(3); // Only 3 chunks exist
    const mockGetOrCreate = vi
      .fn()
      .mockResolvedValue({ query: mockQuery, count: mockCount });

    vi.mock("chromadb", () => ({
      ChromaClient: vi.fn(() => ({ getOrCreateCollection: mockGetOrCreate })),
    }));
    vi.mock("@anthropic-ai/sdk", () => ({
      default: vi.fn(() => ({
        embeddings: { create: vi.fn().mockResolvedValue(makeEmbeddingResponse(["q"])) },
      })),
    }));

    const { VectorRetriever } = await import("../src/retrieval.js");
    const retriever = new VectorRetriever({ collectionName: "test" });
    await retriever.retrieve("question", 10); // Request 10, only 3 exist

    const queryArgs = mockQuery.mock.calls[0][0];
    expect(queryArgs.nResults).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Tests: RAGChain
// ---------------------------------------------------------------------------

describe("RAGChain", () => {
  function makeChunks() {
    return [
      {
        id: "doc_chunk_0000",
        content: "RAG stands for Retrieval-Augmented Generation.",
        source: "/data/sample.md",
        metadata: { similarity: 0.92, title: "sample" },
      },
      {
        id: "doc_chunk_0001",
        content: "Embeddings are dense vector representations of text.",
        source: "/data/sample.md",
        metadata: { similarity: 0.85, title: "sample" },
      },
    ];
  }

  it("returns a RAGResponse with answer, sources, and retrievedChunks", async () => {
    vi.mock("chromadb", () => ({
      ChromaClient: vi.fn(() => ({ getOrCreateCollection: vi.fn() })),
    }));

    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "RAG retrieves relevant document chunks." }],
    });
    vi.mock("@anthropic-ai/sdk", () => ({
      default: vi.fn(() => ({ messages: { create: mockCreate } })),
    }));

    const { RAGChain } = await import("../src/ragChain.js");
    const mockRetriever = { retrieve: vi.fn().mockResolvedValue(makeChunks()) } as any;
    const chain = new RAGChain(mockRetriever, { model: "claude-opus-4-6", topK: 3 });

    const response = await chain.query("What is RAG?");

    expect(response.answer).toBe("RAG retrieves relevant document chunks.");
    expect(response.sources).toContain("/data/sample.md");
    expect(response.retrievedChunks).toHaveLength(2);
  });

  it("passes retrieved content in the user message to Claude", async () => {
    vi.mock("chromadb", () => ({
      ChromaClient: vi.fn(() => ({ getOrCreateCollection: vi.fn() })),
    }));

    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Some answer." }],
    });
    vi.mock("@anthropic-ai/sdk", () => ({
      default: vi.fn(() => ({ messages: { create: mockCreate } })),
    }));

    const { RAGChain } = await import("../src/ragChain.js");
    const mockRetriever = { retrieve: vi.fn().mockResolvedValue(makeChunks()) } as any;
    const chain = new RAGChain(mockRetriever, { model: "claude-opus-4-6" });

    await chain.query("What is RAG?");

    const callArgs = mockCreate.mock.calls[0][0];
    // System prompt should reference context or assistant role
    expect(callArgs.system).toMatch(/context|assistant/i);
    // User message should include retrieved chunk content and the question
    const userContent = callArgs.messages[0].content as string;
    expect(userContent).toContain("RAG stands for Retrieval-Augmented Generation.");
    expect(userContent).toContain("What is RAG?");
  });

  it("throws for empty question", async () => {
    vi.mock("chromadb", () => ({
      ChromaClient: vi.fn(() => ({ getOrCreateCollection: vi.fn() })),
    }));
    vi.mock("@anthropic-ai/sdk", () => ({
      default: vi.fn(() => ({ messages: { create: vi.fn() } })),
    }));

    const { RAGChain } = await import("../src/ragChain.js");
    const mockRetriever = { retrieve: vi.fn() } as any;
    const chain = new RAGChain(mockRetriever);

    await expect(chain.query("  ")).rejects.toThrow("Question must not be empty");
  });

  it("deduplicates sources from multiple chunks of the same document", async () => {
    vi.mock("chromadb", () => ({
      ChromaClient: vi.fn(() => ({ getOrCreateCollection: vi.fn() })),
    }));

    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Answer here." }],
    });
    vi.mock("@anthropic-ai/sdk", () => ({
      default: vi.fn(() => ({ messages: { create: mockCreate } })),
    }));

    const { RAGChain } = await import("../src/ragChain.js");

    // Both chunks from the same source
    const duplicateSourceChunks = [
      {
        id: "c1",
        content: "Content A",
        source: "/data/doc.md",
        metadata: { similarity: 0.9 },
      },
      {
        id: "c2",
        content: "Content B",
        source: "/data/doc.md",
        metadata: { similarity: 0.8 },
      },
    ];

    const mockRetriever = {
      retrieve: vi.fn().mockResolvedValue(duplicateSourceChunks),
    } as any;
    const chain = new RAGChain(mockRetriever);

    const response = await chain.query("Some question?");

    expect(response.sources).toEqual(["/data/doc.md"]);
    expect(response.sources).toHaveLength(1);
  });

  it("formatRAGResponse produces readable output", async () => {
    vi.mock("chromadb", () => ({
      ChromaClient: vi.fn(() => ({ getOrCreateCollection: vi.fn() })),
    }));
    vi.mock("@anthropic-ai/sdk", () => ({
      default: vi.fn(() => ({})),
    }));

    const { formatRAGResponse } = await import("../src/ragChain.js");

    const response = {
      answer: "This is the answer.",
      sources: ["/data/sample.md"],
      retrievedChunks: [
        {
          id: "c1",
          content: "Some content",
          source: "/data/sample.md",
          metadata: { similarity: 0.95 },
        },
      ],
    };

    const output = formatRAGResponse(response);
    expect(output).toContain("This is the answer.");
    expect(output).toContain("/data/sample.md");
    expect(output).toContain("1 chunk(s)");
  });
});

// ---------------------------------------------------------------------------
// Tests: Integration (end-to-end with all mocks)
// ---------------------------------------------------------------------------

describe("End-to-end pipeline", () => {
  it("runs the full ingest → retrieve → generate pipeline", async () => {
    const mockUpsert = vi.fn().mockResolvedValue(undefined);
    const mockQuery = vi.fn().mockResolvedValue({
      ids: [["chunk_0"]],
      documents: [["Artificial intelligence is transforming every industry."]],
      metadatas: [[{ source: "/tmp/test.txt", chunkIndex: 0 }]],
      distances: [[0.05]],
    });
    const mockCount = vi.fn().mockResolvedValue(1);
    const mockGetOrCreate = vi.fn().mockResolvedValue({
      upsert: mockUpsert,
      query: mockQuery,
      count: mockCount,
    });

    vi.mock("chromadb", () => ({
      ChromaClient: vi.fn(() => ({ getOrCreateCollection: mockGetOrCreate })),
    }));

    const mockEmbeddingsCreate = vi
      .fn()
      .mockResolvedValue(makeEmbeddingResponse(["text"]));
    const mockMessagesCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "AI is transforming industries." }],
    });
    vi.mock("@anthropic-ai/sdk", () => ({
      default: vi.fn(() => ({
        embeddings: { create: mockEmbeddingsCreate },
        messages: { create: mockMessagesCreate },
      })),
    }));

    const { DocumentIngester } = await import("../src/ingestion.js");
    const { VectorRetriever } = await import("../src/retrieval.js");
    const { RAGChain } = await import("../src/ragChain.js");

    // Create a temporary document
    const tmpDir = makeTempDir();
    const filePath = writeFile(
      tmpDir,
      "ai.txt",
      "Artificial intelligence is transforming every industry. " +
        "Machine learning models learn patterns from large datasets."
    );

    // Ingest
    const ingester = new DocumentIngester();
    const docs = ingester.loadDocuments(filePath);
    const chunks = ingester.chunkDocuments(docs, { chunkSize: 200, overlap: 20 });
    await ingester.embedAndStore(chunks, "e2e_test");

    // Retrieve + Generate
    const retriever = new VectorRetriever({ collectionName: "e2e_test" });
    const chain = new RAGChain(retriever, { topK: 3 });
    const response = await chain.query("What is AI?");

    expect(response.answer).toBe("AI is transforming industries.");
    expect(response.sources.length).toBeGreaterThanOrEqual(1);
    expect(mockUpsert).toHaveBeenCalled();
    expect(mockMessagesCreate).toHaveBeenCalled();

    fs.rmSync(tmpDir, { recursive: true });
  });
});
