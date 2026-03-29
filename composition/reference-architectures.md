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

## 6. Autonomous Coding Agent

**Patterns used:** Plan & Execute + Tool Use + Reflection + Memory

**What it does:** Takes a feature specification, plans an implementation, writes and runs code iteratively, fixes failures, and stores project conventions in memory for future tasks.

```mermaid
graph TD
    Spec([Feature Spec]) --> Memory[Memory:<br/>Load project conventions]
    Memory --> Planner[Planner:<br/>Break spec into implementation steps]
    Planner --> Exec[Executor]
    Exec --> ReadFiles[Tool: read_file<br/>Understand existing code]
    Exec --> WriteCode[Tool: write_file<br/>Implement the step]
    Exec --> RunTests[Tool: run_tests<br/>Verify correctness]
    RunTests -->|"pass"| NextStep{More steps?}
    RunTests -->|"fail"| Reflect[Reflection:<br/>Diagnose failure, revise]
    Reflect --> WriteCode
    NextStep -->|"yes"| Exec
    NextStep -->|"no"| MemWrite[Memory:<br/>Store patterns used]
    MemWrite --> Output([Working Implementation])

    style Spec fill:#e3f2fd
    style Memory fill:#f3e5f5
    style Planner fill:#fff8e1
    style Exec fill:#fff3e0
    style ReadFiles fill:#e8f5e9
    style WriteCode fill:#e8f5e9
    style RunTests fill:#e8f5e9
    style Reflect fill:#fce4ec
    style MemWrite fill:#f3e5f5
    style Output fill:#e3f2fd
```

**Design decisions:**
- Plan & Execute creates an ordered implementation plan upfront (read existing code → write tests → implement → verify), reducing the ad-hoc thrashing of a pure ReAct approach
- Tool Use provides grounded access to the actual filesystem and test runner — the agent operates on real files, not simulated output
- Reflection is scoped specifically to test failures: diagnose the error, identify the fix, revise the relevant file only
- Memory stores coding conventions, directory structure, and patterns discovered in previous tasks — a new task on the same codebase doesn't re-explore from scratch
- Iteration guard: max 3 reflection cycles per step; if exceeded, escalate to the developer

**Key tradeoff:** Upfront planning is efficient for straightforward specs but brittle for exploratory tasks where requirements emerge through implementation. For exploratory work, replace Plan & Execute with ReAct.

---

## 7. Document Processing Pipeline

**Patterns used:** Parallel Calls + Prompt Chaining + Evaluator-Optimizer + Routing

**What it does:** Ingests batches of documents (invoices, contracts, reports), classifies each, extracts structured fields in parallel, validates extraction quality, and routes anomalies for human review.

```mermaid
graph TD
    Docs([Document Batch]) --> Classify[Parallel Calls:<br/>Classify each document type]
    Classify --> Router[Router:<br/>Route by document type]

    Router -->|"invoice"| InvoiceChain[Prompt Chain:<br/>Extract → Normalize → Validate]
    Router -->|"contract"| ContractChain[Prompt Chain:<br/>Extract clauses → Summarize → Flag risks]
    Router -->|"report"| ReportChain[Prompt Chain:<br/>Extract KPIs → Structure → Summarize]

    InvoiceChain --> EvalOpt[Evaluator-Optimizer:<br/>Validate extraction quality]
    ContractChain --> EvalOpt
    ReportChain --> EvalOpt

    EvalOpt -->|"high confidence"| Store([Write to Database])
    EvalOpt -->|"low confidence"| Human([Human Review Queue])

    style Docs fill:#e3f2fd
    style Classify fill:#e8f5e9
    style Router fill:#fff8e1
    style InvoiceChain fill:#fff3e0
    style ContractChain fill:#fff3e0
    style ReportChain fill:#fff3e0
    style EvalOpt fill:#e8f5e9
    style Store fill:#e3f2fd
    style Human fill:#ffcdd2
```

**Design decisions:**
- Parallel Calls for classification: all documents in the batch are typed simultaneously before any extraction begins, making the pipeline significantly faster
- Routing on document type: each type has a different extraction chain (invoices need line items; contracts need clause identification; reports need KPI extraction)
- Prompt Chaining for extraction: multi-step transformation (raw text → extracted fields → normalized format → validated structure) with gates between steps to catch format errors early
- Evaluator-Optimizer as a confidence gate: low-confidence extractions go to a human review queue rather than silently propagating errors to the database
- Cost note: use a cheap model for classification (short, structured output) and a more capable model for extraction (complex structured output)

**Key tradeoff:** This architecture favors throughput over latency. For interactive document Q&A, replace the Prompt Chain with a RAG pipeline.

---

## 8. Personalized Onboarding Agent

**Patterns used:** Routing + Memory + RAG + Prompt Chaining

**What it does:** Guides new users through onboarding by adapting the flow to their role and experience level, answering questions from documentation, and remembering progress across sessions.

```mermaid
graph TD
    User([New User]) --> MemLoad[Memory:<br/>Load prior progress + preferences]
    MemLoad --> Router[Router:<br/>Classify user type + experience level]

    Router -->|"developer"| DevPath[Prompt Chain:<br/>API keys → First call → SDK setup → Deploy]
    Router -->|"analyst"| AnalystPath[Prompt Chain:<br/>Connect data → First query → Dashboard → Export]
    Router -->|"admin"| AdminPath[Prompt Chain:<br/>Invite team → Permissions → Billing → Audit]

    DevPath --> QA[RAG:<br/>Answer inline questions<br/>from docs]
    AnalystPath --> QA
    AdminPath --> QA

    QA --> MemWrite[Memory:<br/>Store completed steps<br/>+ learned preferences]
    MemWrite --> Output([Personalized Next Step])

    Output -->|"task complete"| NextStep[Advance in chain]
    Output -->|"stuck"| Human([Offer live support])

    style User fill:#e3f2fd
    style MemLoad fill:#f3e5f5
    style Router fill:#fff8e1
    style DevPath fill:#fff3e0
    style AnalystPath fill:#fff3e0
    style AdminPath fill:#fff3e0
    style QA fill:#e8f5e9
    style MemWrite fill:#f3e5f5
    style Output fill:#e3f2fd
    style Human fill:#ffcdd2
```

**Design decisions:**
- Memory loads first: if the user returns mid-onboarding, they resume from their last completed step rather than starting over — the single most impactful improvement to onboarding completion rates
- Routing on user role + experience level: a developer with 5 years of API experience gets a different chain than a first-time developer; detection is a short LLM call at session start
- Prompt Chaining for each path: each step in the chain is a discrete task (complete the action, confirm it worked) with a gate that checks completion before advancing
- RAG for inline Q&A: users can ask "what does this parameter do?" at any point without leaving the onboarding flow; answers come from the actual documentation, not the LLM's training data
- Human escalation: if a user is stuck on the same step for 2+ attempts, offer a live support link rather than looping indefinitely
- Memory stores not just progress but also which explanations were helpful, enabling personalization of future onboarding sessions

**Key tradeoff:** This architecture assumes users follow a sequential path. For products with non-linear onboarding, replace the Prompt Chain paths with Plan & Execute so the agent can adapt the sequence based on user actions.

---

## Architecture Selection Guide

| If You Need... | Start With | Then Add | Reference |
|----------------|-----------|----------|-----------|
| Knowledge-grounded Q&A | RAG | + ReAct for multi-step reasoning | #1 Research Assistant |
| Automated code review | Multi-Agent | + Tool Use for static analysis tools | #2 Code Review Agent |
| Customer-facing support | Routing | + RAG + Memory + Tool Use | #3 Customer Support |
| Analytical pipelines | Plan & Execute | + Tool Use for data tools | #4 Data Analysis |
| Long-form content generation | Orchestrator-Worker | + Reflection + Memory | #5 Content Generation |
| Writing and running code | Plan & Execute | + Tool Use + Reflection + Memory | #6 Autonomous Coding |
| Batch document processing | Parallel Calls | + Routing + Prompt Chaining + Evaluator-Optimizer | #7 Document Processing |
| User onboarding / guided flows | Routing + Memory | + RAG + Prompt Chaining | #8 Personalized Onboarding |
| Multi-domain complex tasks | Multi-Agent | + RAG + Memory per worker | #1, #2, #6 |
| High-quality output guarantee | Any generator | + Reflection or Evaluator-Optimizer | #4, #5, #7 |

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
