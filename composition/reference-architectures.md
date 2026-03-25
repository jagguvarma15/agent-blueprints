# Reference Architectures

These are example composed systems showing how patterns combine to solve real-world problems. Each architecture is an *application* of composable patterns — not a pattern itself.

Use these as starting points and adapt them to your specific requirements.

## 1. Research Assistant

**Patterns used:** Routing + RAG + ReAct + Reflection

**What it does:** Takes a research question, retrieves relevant sources, reasons through the evidence, and produces a cited, quality-checked analysis.

```mermaid
graph TD
    Q([Research Question]) --> Router[Router:<br/>Classify question type]
    Router -->|"factual"| RAGAgent[RAG + ReAct Agent:<br/>Retrieve and reason]
    Router -->|"comparative"| MultiSearch[Parallel RAG:<br/>Multiple sources]
    Router -->|"exploratory"| PlanAgent[Plan & Execute:<br/>Break down research]
    RAGAgent --> Reflect[Reflection:<br/>Check quality + citations]
    MultiSearch --> Reflect
    PlanAgent --> Reflect
    Reflect -->|"needs revision"| RAGAgent
    Reflect -->|"acceptable"| Output([Research Report])

    style Q fill:#e3f2fd
    style Router fill:#fff8e1
    style RAGAgent fill:#fff3e0
    style MultiSearch fill:#fff3e0
    style PlanAgent fill:#fff3e0
    style Reflect fill:#e8f5e9
    style Output fill:#e3f2fd
```

**Design decisions:**
- Routing separates factual queries (single retrieval) from comparative queries (multi-source) and exploratory queries (planning needed)
- Reflection validates citation accuracy and argument completeness
- Iteration budget: max 2 reflection cycles to control cost

## 2. Code Review Agent

**Patterns used:** Multi-Agent + Tool Use + Reflection

**What it does:** Reviews code changes using specialized agents for different aspects (correctness, security, performance), then synthesizes findings.

```mermaid
graph TD
    PR([Code Diff]) --> Supervisor[Supervisor:<br/>Analyze change scope]
    Supervisor -->|"logic review"| Correctness[Correctness Agent<br/>Tools: parse, type-check]
    Supervisor -->|"security review"| Security[Security Agent<br/>Tools: SAST scan, CVE lookup]
    Supervisor -->|"perf review"| Performance[Performance Agent<br/>Tools: complexity analysis]
    Correctness --> Supervisor
    Security --> Supervisor
    Performance --> Supervisor
    Supervisor --> Synthesize[Synthesize findings]
    Synthesize --> Reflect[Reflect:<br/>Are findings actionable?]
    Reflect --> Output([Review Comments])

    style PR fill:#e3f2fd
    style Supervisor fill:#fff8e1
    style Correctness fill:#fff3e0
    style Security fill:#fff3e0
    style Performance fill:#fff3e0
    style Reflect fill:#e8f5e9
    style Output fill:#e3f2fd
```

**Design decisions:**
- Specialized agents with domain-specific tools and prompts
- Supervisor decides which agents to invoke based on the change scope (a CSS-only change skips the security agent)
- Reflection ensures findings are specific and actionable, not vague

## 3. Customer Support System

**Patterns used:** Routing + RAG + Memory + Tool Use

**What it does:** Handles customer inquiries by classifying intent, retrieving relevant knowledge, remembering conversation history, and taking actions when needed.

```mermaid
graph TD
    Msg([Customer Message]) --> Memory[Memory:<br/>Load conversation history]
    Memory --> Router[Router:<br/>Classify intent]
    Router -->|"FAQ"| RAG[RAG Agent:<br/>Knowledge base lookup]
    Router -->|"account issue"| Account[Tool Use Agent:<br/>Account API tools]
    Router -->|"escalation"| Human([Escalate to Human])
    RAG --> Respond[Generate Response]
    Account --> Respond
    Respond --> MemWrite[Memory:<br/>Store interaction]
    MemWrite --> Output([Response])

    style Msg fill:#e3f2fd
    style Memory fill:#f3e5f5
    style Router fill:#fff8e1
    style RAG fill:#fff3e0
    style Account fill:#fff3e0
    style Human fill:#ffcdd2
    style Respond fill:#e8f5e9
    style MemWrite fill:#f3e5f5
    style Output fill:#e3f2fd
```

**Design decisions:**
- Memory loads before routing so the classifier has conversation context
- Routing includes an explicit escalation path for issues agents can't handle
- RAG for knowledge questions, Tool Use for account actions (refund, update, etc.)
- Every interaction is stored for future context

## 4. Data Analysis Pipeline

**Patterns used:** Plan & Execute + Tool Use + Evaluator-Optimizer

**What it does:** Takes an analytical question, plans a data analysis approach, executes queries and transformations, then validates the results.

```mermaid
graph TD
    Q([Analysis Question]) --> Planner[Planner:<br/>Create analysis plan]
    Planner --> Step1[Step 1: Query data<br/>Tools: SQL, API]
    Step1 --> Step2[Step 2: Transform<br/>Tools: aggregate, pivot]
    Step2 --> Step3[Step 3: Analyze<br/>Tools: stats, correlate]
    Step3 --> Eval[Evaluator:<br/>Check methodology]
    Eval -->|"issues found"| Planner
    Eval -->|"sound analysis"| Output([Analysis Report])

    style Q fill:#e3f2fd
    style Planner fill:#fff8e1
    style Step1 fill:#fff3e0
    style Step2 fill:#fff3e0
    style Step3 fill:#fff3e0
    style Eval fill:#e8f5e9
    style Output fill:#e3f2fd
```

**Design decisions:**
- Plan & Execute ensures the analysis follows a methodical approach
- Each step has specialized tools (data querying, transformation, statistical analysis)
- Evaluator-Optimizer validates the methodology and results before producing the final report
- Replanning if the evaluator finds methodological issues

## 5. Content Generation System

**Patterns used:** Orchestrator-Worker + Reflection + Memory

**What it does:** Generates long-form content by breaking it into sections, writing each section with relevant context, and iteratively improving quality.

```mermaid
graph TD
    Brief([Content Brief]) --> Orch[Orchestrator:<br/>Plan sections]
    Orch --> W1[Writer 1:<br/>Section A]
    Orch --> W2[Writer 2:<br/>Section B]
    Orch --> W3[Writer 3:<br/>Section C]
    W1 & W2 & W3 --> Assemble[Assemble Draft]
    Assemble --> Reflect[Reflection:<br/>Coherence check]
    Reflect -->|"needs revision"| Orch
    Reflect -->|"coherent"| Memory[Memory:<br/>Store style + preferences]
    Memory --> Output([Final Content])

    style Brief fill:#e3f2fd
    style Orch fill:#fff8e1
    style W1 fill:#fff3e0
    style W2 fill:#fff3e0
    style W3 fill:#fff3e0
    style Reflect fill:#e8f5e9
    style Memory fill:#f3e5f5
    style Output fill:#e3f2fd
```

**Design decisions:**
- Orchestrator-Worker for parallel section writing
- Reflection checks coherence across sections (not just individual quality)
- Memory stores learned style preferences for future content generation
- Workers can receive style guidance from memory

## Architecture Selection Guide

| If You Need... | Start With | Then Add |
|----------------|-----------|----------|
| Knowledge-grounded Q&A | RAG | + ReAct for multi-step reasoning |
| Task automation | Tool Use | + ReAct for adaptive tool selection |
| Complex task decomposition | Plan & Execute | + Multi-Agent for specialized workers |
| Diverse input handling | Routing | + specialized handlers per route |
| High-quality generation | Any generator | + Reflection for iterative improvement |
| Multi-session continuity | Any agent | + Memory for cross-session context |
| Multi-domain problems | Multi-Agent | + RAG + Memory per worker |

## Design Considerations for All Architectures

### Cost Control
- Set iteration limits on every loop (ReAct, Reflection, Evaluator-Optimizer)
- Use cheaper models for classification/routing, more capable models for generation
- Cache retrieval results and tool outputs where possible

### Latency
- Identify the critical path and parallelize where possible
- Put routing early to avoid unnecessary processing
- Set timeouts on tool calls and agent loops

### Observability
- Log every pattern boundary crossing (routing decisions, delegation, reflection cycles)
- Track token usage and latency per pattern per request
- Alert on iteration count anomalies (agent loops using max iterations too often)

### Failure Modes
- Define fallback behavior at each composition point
- Graceful degradation: if RAG retrieval fails, can the agent still provide a useful (if less grounded) response?
- Human escalation paths for cases the system can't handle
