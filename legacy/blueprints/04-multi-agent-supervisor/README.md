# Blueprint 04: Multi-Agent Supervisor

[![Complexity](https://img.shields.io/badge/Complexity-Intermediate-yellow?style=flat-square)]()
[![Pattern](https://img.shields.io/badge/Pattern-Multi--agent-blue?style=flat-square)]()
[![Python](https://img.shields.io/badge/Python-3.11%2B-green?style=flat-square&logo=python)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)]()

A **supervisor agent** delegates subtasks to specialised sub-agents and aggregates their results, enabling role-based division of labour with centralised control.

---

## The Problem

Complex real-world tasks rarely fall neatly into a single domain. A request like *"Research quantum computing trends, write a blog post about them, and include a Python code example"* demands three distinct capabilities: information gathering, prose writing, and code generation. A single general-purpose LLM can attempt all three, but it will be outperformed by agents that are purpose-built and system-prompted for each role.

Naively chaining specialised agents together creates a rigid pipeline that cannot adapt when tasks arrive in unexpected combinations or require iterative back-and-forth between domains.

## The Solution

The Multi-Agent Supervisor pattern introduces a **central supervisor** whose sole job is to:

1. Analyse the incoming task and decompose it into subtasks.
2. Route each subtask to the most appropriate specialised worker agent.
3. Collect the workers' results.
4. Synthesise a coherent final response.

The supervisor uses tool-calling to invoke agents, which gives it full control over sequencing and lets it call multiple workers or call the same worker more than once if the task requires it.

```
User Task
   │
   ▼
┌─────────────────┐
│  Supervisor LLM │  ← decides which agents to call and in what order
└────────┬────────┘
         │  tool calls
    ┌────┴──────────────────┐
    │           │           │
    ▼           ▼           ▼
┌────────┐ ┌────────┐ ┌─────────┐
│Research│ │  Code  │ │ Writing │
│ Agent  │ │ Agent  │ │  Agent  │
└────────┘ └────────┘ └─────────┘
    │           │           │
    └────┬──────┴───────────┘
         │  results
         ▼
┌─────────────────┐
│  Supervisor LLM │  ← synthesises final answer
└────────┬────────┘
         │
         ▼
    Final Response
```

## When to Use

- Tasks that require **distinctly different skill sets** (research vs. writing vs. coding).
- Workflows where the **optimal agent sequence is not known in advance** and must be determined at runtime.
- Systems where you want to **swap or extend agents** without changing the rest of the pipeline.
- Situations requiring **iterative refinement** — e.g. the supervisor can send a draft back to the writing agent after the research agent provides new facts.

## When NOT to Use

- **Simple, single-domain tasks** — routing overhead outweighs any benefit.
- **Latency-critical applications** — the supervisor adds at least one extra LLM call before work begins.
- Tasks where all steps are **strictly sequential and predetermined** — a simple pipeline is cheaper and easier to debug.
- When you need **maximum parallelism** — consider Blueprint 05 (Multi-Agent Parallel) instead.

## Trade-offs

| Dimension | Trade-off |
|-----------|-----------|
| Quality | Higher — each agent is specialised and system-prompted for its domain |
| Latency | Higher — at minimum one supervisor call precedes any worker call |
| Cost | Higher — more total LLM calls per request |
| Flexibility | Very high — supervisor adapts routing dynamically |
| Debuggability | Medium — need to trace calls across multiple agents |
| Scalability | Good — add new agents by registering them; supervisor discovers them automatically |

---

## Project Structure

```
04-multi-agent-supervisor/
├── README.md               ← you are here
├── architecture.md         ← Mermaid diagrams and design notes
├── docker-compose.yml      ← run everything with one command
├── python/
│   ├── pyproject.toml
│   ├── .env.example
│   ├── src/
│   │   ├── supervisor.py   ← SupervisorAgent class
│   │   ├── agents.py       ← worker agent implementations
│   │   └── main.py         ← runnable entry point
│   └── tests/
│       └── test_supervisor.py
└── typescript/
    ├── package.json
    ├── tsconfig.json
    ├── .env.example
    ├── src/
    │   ├── supervisor.ts   ← SupervisorAgent class
    │   ├── agents.ts       ← worker agent implementations
    │   └── index.ts        ← runnable entry point
    └── tests/
        └── supervisor.test.ts
```

---

## Quick Start

### Prerequisites

- An **Anthropic API key** (set as `ANTHROPIC_API_KEY` in your environment or `.env` file).
- **Python 3.11+** with [uv](https://github.com/astral-sh/uv) — for the Python implementation.
- **Node 20+** with [pnpm](https://pnpm.io/) 9+ — for the TypeScript implementation.

### Python

```bash
cd blueprints/04-multi-agent-supervisor/python
uv sync
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
uv run python src/main.py
```

Run tests:

```bash
uv run pytest tests/ -v
```

### TypeScript

```bash
cd blueprints/04-multi-agent-supervisor/typescript
pnpm install
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
pnpm dev
```

Run tests:

```bash
pnpm test
```

### Docker Compose

```bash
cd blueprints/04-multi-agent-supervisor
docker compose up
```

---

## How It Works

### 1. Agent Registry

Each worker agent is registered with a name, description, and `run(task)` method. The supervisor receives a list of all registered agents at startup and uses their descriptions to decide whom to call.

### 2. Supervisor Decision Loop

The supervisor is given the user's task plus tool definitions derived from the agent registry. It enters a loop:

1. Call the Anthropic API with the conversation so far.
2. If the response contains tool calls, dispatch each one to the corresponding worker agent.
3. Append the tool results to the conversation.
4. Repeat until the model produces a plain text response (no tool calls) — that is the final answer.

### 3. Worker Agents

Each worker is a lightweight Anthropic API client with a specialised system prompt:

| Agent | System Prompt Focus | Typical Tasks |
|-------|---------------------|---------------|
| `ResearchAgent` | Information gathering, fact-finding, web search simulation | "What is X?", "Find facts about Y" |
| `CodeAgent` | Writing, explaining, and debugging code | "Write a Python function to…", "Explain this snippet" |
| `WritingAgent` | Drafting, editing, and structuring prose | "Write a blog post", "Summarise this for a general audience" |

### 4. Result Synthesis

After all worker calls are complete the supervisor produces a final response that integrates every worker's output into a single coherent answer.

---

## Extending the Blueprint

### Adding a New Agent

**Python:**

```python
# agents.py
class DataAgent(BaseAgent):
    name = "data_analyst"
    description = "Analyses datasets, produces statistics, and creates data summaries."

    def run(self, task: str) -> str:
        # implement using Anthropic client with specialised system prompt
        ...

# Register it
AGENT_REGISTRY["data_analyst"] = DataAgent()
```

**TypeScript:**

```typescript
// agents.ts
export class DataAgent implements WorkerAgent {
  name = "data_analyst";
  description = "Analyses datasets, produces statistics, and creates data summaries.";

  async run(task: string): Promise<string> {
    // implement using Anthropic client
  }
}

AGENT_REGISTRY["data_analyst"] = new DataAgent();
```

### Changing the Model

Set `ANTHROPIC_MODEL` in your `.env` file. The supervisor and all worker agents read from this variable:

```env
ANTHROPIC_MODEL=claude-opus-4-6
```

---

## Related Blueprints

| Blueprint | How It Relates |
|-----------|----------------|
| [01 — ReAct Agent](../01-react-agent/) | Supervisor itself uses a ReAct-style loop internally |
| [05 — Multi-Agent Parallel](../05-multi-agent-parallel/) | Same cast of agents, but run concurrently instead of sequentially |
| [06 — Memory Agent](../06-memory-agent/) | Add persistent memory to any worker agent in this blueprint |
| [10 — Human-in-the-Loop](../10-human-in-the-loop/) | Insert human approval before the supervisor dispatches high-stakes tasks |

---

## License

MIT — see [LICENSE](../../LICENSE).
