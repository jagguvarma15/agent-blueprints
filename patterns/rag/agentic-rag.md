# Agentic RAG

## Overview

**Agentic RAG** extends basic Retrieval-Augmented Generation by giving an LLM agent dynamic control over the retrieval process. Instead of a fixed single-pass retrieve-then-generate pipeline, an agentic RAG system lets the model decide *whether* to retrieve, *what* to retrieve, *how many times* to retrieve, and *how* to reformulate queries — all as part of an iterative reasoning loop.

The result is dramatically higher answer quality for complex, multi-hop questions that a single retrieval pass cannot fully resolve.

---

## The Problem with Basic RAG

Basic RAG retrieves a fixed set of top-K chunks based on a single embedding of the user's question, then generates an answer. This fails in several important scenarios:

| Failure Mode | Example | Root Cause |
|---|---|---|
| **Single-hop limitation** | "Who founded the company that acquired the startup that built X?" | Requires chaining three lookups; one retrieval misses the chain |
| **Vague initial queries** | "Tell me about the new product" | Ambiguous embedding retrieves random chunks |
| **Missing context detection** | Answer is "I don't know" but the document exists under different terminology | No mechanism to try alternative queries |
| **Over-retrieval** | Simple factual question retrieves 5 irrelevant chunks | No intelligence to skip retrieval for in-context facts |
| **Evidence gaps** | Retrieved chunks partially answer but additional evidence exists | No iterative refinement |

---

## The Agentic RAG Solution

An agentic RAG system arms the LLM with retrieval as a **tool** it can call autonomously. The agent reasons about the question, calls retrieval tools as needed, evaluates results, reformulates queries, and continues until it has sufficient evidence — then generates a grounded final answer.

```
User Question
     │
     ▼
┌──────────────────────────────────┐
│        Agent Reasoning Loop      │
│                                  │
│  1. Analyse the question         │
│  2. Decide: retrieve or answer?  │──→ Final answer if ready
│  3. Formulate a search query     │
│  4. Call retrieve() tool         │
│  5. Evaluate retrieved chunks    │
│  6. If insufficient → goto 3     │
│  7. Synthesise and generate      │
└──────────────────────────────────┘
         │          ▲
         ▼          │
   ┌───────────┐    │ ranked chunks
   │ Vector DB │────┘
   └───────────┘
```

---

## Core Retrieval Strategies

### 1. Query Decomposition
Break a complex question into sub-questions, retrieve evidence for each independently, then synthesise.

```
Q: "Compare the environmental impact of electric vehicles in 2020 vs 2023"
  ↓ decompose
  Q1: "Electric vehicle environmental impact 2020"
  Q2: "Electric vehicle environmental impact 2023"
  Q3: "EV battery manufacturing emissions trends"
  ↓ retrieve each
  ↓ synthesise comparison
```

**When to use:** Multi-aspect questions, comparisons, questions with temporal dimensions.

### 2. Iterative Retrieval with Reflection
Retrieve, evaluate quality, decide whether to refine the query or accept the results.

```python
def iterative_retrieve(question: str, max_rounds: int = 3) -> list[Chunk]:
    query = question
    all_chunks = []

    for round in range(max_rounds):
        chunks = retriever.retrieve(query, top_k=5)

        # Agent evaluates: are these chunks sufficient?
        evaluation = agent.evaluate_relevance(question, chunks)

        if evaluation.sufficient:
            break

        # Agent reformulates query based on what's missing
        query = agent.reformulate_query(question, chunks, evaluation.gaps)
        all_chunks.extend(chunks)

    return deduplicate(all_chunks)
```

**When to use:** Imprecise initial queries, specialised vocabulary mismatches, large corpora.

### 3. Step-Back Prompting
Before retrieving on the specific question, retrieve on a more general "step-back" question to gather background context first.

```
Specific: "What was the GDP of Germany in Q3 2023?"
Step-back: "What are the components of GDP and how is it measured?"
           → retrieve background
           → then retrieve specific answer in context
```

**When to use:** Questions requiring domain background, technical questions with assumed context.

### 4. Hypothetical Document Embedding (HyDE)
Generate a hypothetical answer to the question, embed that answer, and use it as the retrieval query — because a synthetic answer has a similar embedding distribution to real answers.

```python
# Instead of embedding the question
hypothetical_answer = llm.generate(f"Write a brief answer to: {question}")
query_embedding = embed(hypothetical_answer)   # More similar to real answers
chunks = vector_db.query(query_embedding)
```

**When to use:** Short factual questions whose embeddings are semantically distant from the answer documents.

### 5. Self-RAG
The agent generates with inline retrieval decisions — it can insert `[retrieve]` tokens mid-generation and fetch additional context on demand.

**When to use:** Long-form generation where different sections need different source material.

---

## Implementation Pattern

### Tool Definition

```python
# Python — define retrieval as an agent tool
retrieve_tool = {
    "name": "retrieve",
    "description": (
        "Search the knowledge base for relevant information. "
        "Returns the top-K most relevant document chunks for the given query. "
        "Call this whenever you need information to answer the question. "
        "You may call it multiple times with different queries."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query. Make it specific and focused.",
            },
            "top_k": {
                "type": "integer",
                "description": "Number of chunks to retrieve (1-10). Default: 5.",
                "default": 5,
            },
        },
        "required": ["query"],
    },
}
```

### Agent Loop

```python
import anthropic

client = anthropic.Anthropic()

def agentic_rag(question: str, retriever, max_iterations: int = 5) -> str:
    messages = [{"role": "user", "content": question}]

    for _ in range(max_iterations):
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=AGENTIC_RAG_SYSTEM_PROMPT,
            tools=[retrieve_tool],
            messages=messages,
        )

        if response.stop_reason == "end_turn":
            # Agent is confident; extract final text answer
            return extract_text(response.content)

        # Process tool calls
        tool_results = []
        for block in response.content:
            if block.type == "tool_use" and block.name == "retrieve":
                query = block.input["query"]
                top_k = block.input.get("top_k", 5)
                chunks = retriever.retrieve(query, top_k=top_k)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": format_chunks(chunks),
                })

        # Append assistant turn + tool results
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

    raise RuntimeError("Agentic RAG exceeded max iterations without a final answer.")
```

### System Prompt

```python
AGENTIC_RAG_SYSTEM_PROMPT = """You are a research assistant with access to a knowledge base.

To answer the user's question:
1. Analyse what information you need.
2. Use the `retrieve` tool to search the knowledge base. You may call it multiple times
   with different queries if the first results are insufficient.
3. Evaluate retrieved chunks — if they don't fully answer the question, reformulate
   your query and retrieve again.
4. Once you have sufficient evidence, generate a clear, grounded answer.
5. Cite your sources at the end of your answer.

Rules:
- Answer ONLY from retrieved information. Do not use knowledge from training if it
  contradicts or is absent from the retrieved documents.
- If you cannot find the answer after multiple retrievals, say so explicitly.
- Be concise — don't pad answers with filler.
"""
```

---

## TypeScript Implementation

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const RETRIEVE_TOOL: Anthropic.Tool = {
  name: "retrieve",
  description:
    "Search the knowledge base for relevant document chunks. " +
    "Call multiple times with different queries if needed.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Specific search query" },
      top_k: { type: "number", description: "Number of results (1-10)", default: 5 },
    },
    required: ["query"],
  },
};

async function agenticRag(
  question: string,
  retriever: VectorRetriever,
  maxIterations = 5,
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: question },
  ];

  for (let i = 0; i < maxIterations; i++) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: AGENTIC_RAG_SYSTEM_PROMPT,
      tools: [RETRIEVE_TOOL],
      messages,
    });

    if (response.stop_reason === "end_turn") {
      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n\n");
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      response.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
        .map(async (block) => {
          const input = block.input as { query: string; top_k?: number };
          const chunks = await retriever.retrieve(input.query, input.top_k ?? 5);
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: formatChunks(chunks),
          };
        }),
    );

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error("Agentic RAG exceeded max iterations.");
}
```

---

## Evaluation

Agentic RAG systems require evaluation of both retrieval and generation quality:

### Retrieval Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| **Retrieval Recall@K** | % of relevant chunks retrieved in top-K | > 0.85 |
| **Precision@K** | % of retrieved chunks that are relevant | > 0.7 |
| **Average retrievals per query** | How many tool calls the agent makes | < 3 for simple, < 6 for complex |
| **Query reformulation rate** | % of queries that trigger a retry | Track for quality signal |

### Generation Metrics

| Metric | Description |
|--------|-------------|
| **Faithfulness** | Does the answer contain only information from retrieved chunks? |
| **Answer completeness** | Does the answer address all sub-questions? |
| **Source coverage** | Does the answer cite the relevant sources? |
| **Hallucination rate** | % of claims not supported by retrieved context |

### Evaluation Harness

```python
# LLM-as-judge evaluation pattern
def evaluate_faithfulness(question: str, answer: str, retrieved_chunks: list[str]) -> float:
    """Score whether every claim in the answer is supported by the retrieved chunks."""
    prompt = f"""
    Retrieved context:
    {chr(10).join(retrieved_chunks)}

    Answer to evaluate:
    {answer}

    Rate faithfulness 0.0 to 1.0: does every factual claim in the answer
    appear in the retrieved context? Output only a number.
    """
    score = float(llm.generate(prompt).strip())
    return score
```

---

## Comparison: Basic RAG vs Agentic RAG

| Dimension | Basic RAG | Agentic RAG |
|-----------|-----------|-------------|
| **Retrieval passes** | 1 (fixed) | 1–N (adaptive) |
| **Query strategy** | Original question embedding | Reformulated, decomposed, HyDE |
| **Latency** | ~200–400 ms | ~800 ms – 3 s |
| **Cost** | 1 LLM call + 1 embedding | 2–6 LLM calls + N embeddings |
| **Simple queries** | Excellent | Overkill |
| **Multi-hop queries** | Poor | Excellent |
| **Vague queries** | Poor | Good |
| **Observability** | Easy (single round-trip) | Requires tracing the agent loop |

**Use Agentic RAG when:**
- Questions require multi-hop reasoning across documents
- The corpus uses specialised vocabulary that may differ from user phrasing
- Answer quality justifies the additional latency and cost
- Users ask complex, open-ended research questions

**Use Basic RAG when:**
- Questions are well-scoped and single-hop
- Latency is critical (< 500 ms SLA)
- Cost is tightly constrained
- The corpus is well-structured and vocabulary-aligned with user queries

---

## Related Patterns

| Pattern | Relationship |
|---------|-------------|
| [Basic RAG](./basic-rag.md) | Foundation — agentic RAG extends this with iterative retrieval |
| [Advanced RAG](./advanced-rag.md) | Complements — re-ranking, hybrid search, and HyDE apply here too |
| [ReAct](../orchestration/react.md) | Architecture — agentic RAG implements the ReAct loop with retrieval tools |
| [Plan & Execute](../orchestration/plan-execute.md) | Alternative — decompose the question upfront, then retrieve per sub-question |
| [Supervisor](../multi-agent/supervisor.md) | Scaling — a supervisor can route to specialised RAG agents per domain |

---

## References

- [Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection](https://arxiv.org/abs/2310.11511) (Asai et al., 2023)
- [FLARE: Active Retrieval Augmented Generation](https://arxiv.org/abs/2305.06983) (Jiang et al., 2023)
- [HyDE: Precise Zero-Shot Dense Retrieval without Relevance Labels](https://arxiv.org/abs/2212.10496) (Gao et al., 2022)
- [Step-Back Prompting](https://arxiv.org/abs/2310.06117) (Zheng et al., 2023)
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
