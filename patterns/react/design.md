# ReAct — Design

## Component Breakdown

```mermaid
graph TD
    Input([Task + Tools]) --> Loop[Agent Loop Controller]
    Loop --> LLM[LLM: Reason + Decide]
    LLM -->|"tool_call"| Dispatch[Tool Dispatcher]
    LLM -->|"text response"| Output([Final Answer])
    Dispatch --> Registry[Tool Registry]
    Registry -->|"execute"| Tool[Tool Function]
    Tool -->|"observation"| History[(Message History)]
    History -->|"full context"| LLM
    Guard[/"Iteration Guard"/] -->|"max reached"| Output

    style Input fill:#e3f2fd
    style Loop fill:#f3e5f5
    style LLM fill:#fff3e0
    style Dispatch fill:#fff8e1
    style Registry fill:#e8f5e9
    style Tool fill:#e8f5e9
    style History fill:#f3e5f5
    style Output fill:#e3f2fd
    style Guard fill:#fff8e1
```

### Agent Loop Controller
Drives the think-act-observe cycle. On each iteration: send messages to the LLM, check if the response is a tool call or final answer, dispatch tool calls, append observations, check guards.

### LLM (Reasoning Engine)
Receives the system prompt, tool schemas, and full message history. Produces either a tool call request or a text response. The system prompt instructs the LLM to reason before acting.

### Tool Registry
Maps tool names to implementations. Each entry contains the tool schema (for the LLM) and the handler function (for execution). Tools are registered at initialization.

### Tool Dispatcher
Routes tool call requests to the correct handler. Validates arguments against the schema. Handles execution errors gracefully.

### Message History
The growing list of messages: user input, assistant reasoning, tool calls, and observations. This is the agent's "working memory" for the current task.

### Iteration Guard
Enforces max iterations. When reached, forces the agent to return its best answer so far rather than continuing.

## Data Flow Specification

Each iteration cycle:
1. **Messages → LLM:** Full message history + system prompt + tool schemas
2. **LLM → Dispatcher:** Tool call with name and arguments (or text response)
3. **Dispatcher → Tool:** Validated arguments
4. **Tool → History:** Observation result appended as tool response message
5. **History → LLM:** Updated history for next iteration

### Message History Growth
The history grows by ~2 messages per iteration (assistant tool_call + tool result). For a 10-iteration task, that's ~20 messages plus the original user message. This can consume significant context window.

**Management strategies:**
- **Truncation:** Drop oldest messages when approaching context limit
- **Summarization:** Periodically summarize older messages into a condensed form
- **Sliding window:** Keep last N messages plus a summary of earlier ones

## Error Handling Strategy

### Tool Call Errors
- **Invalid tool name:** Return error observation: "Tool X not found. Available tools: [...]"
- **Invalid arguments:** Return error observation with schema hint
- **Execution failure:** Return error observation. The LLM should adapt its approach.
- **Timeout:** Return timeout observation. The LLM can retry or try a different tool.

### Agent Loop Errors
- **Infinite loop:** The iteration guard prevents this. When hit, return whatever context has been gathered.
- **Repeated failures:** If the agent calls the same tool with the same args 3+ times, inject a hint to try a different approach.
- **Context overflow:** Summarize or truncate history.

## Scaling Considerations

- **Cost:** Unpredictable — depends on iteration count. Set cost budgets alongside iteration limits.
- **Latency:** Variable. Each iteration = 1 LLM call + tool execution time.
- **Throughput:** Each agent run is independent. Scale by running multiple agents in parallel.
- **At 100x:** Use cheaper models for simple tool-use tasks. Cache common tool results.

## Composition Notes

- **+ RAG:** Add retrieval tools to the tool registry. The agent decides when to search.
- **+ Memory:** Load relevant memories into the system prompt. Store important findings after the run.
- **+ Reflection:** After the agent produces a final answer, run a reflection pass. If quality is low, re-run.
- **+ Plan & Execute:** Use ReAct as the step executor within a plan. Each plan step gets a bounded ReAct loop.
