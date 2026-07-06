# Agent Blueprints

[![Documentation Validation](https://github.com/jagguvarma15/agent-blueprints/actions/workflows/docs.yml/badge.svg)](https://github.com/jagguvarma15/agent-blueprints/actions/workflows/docs.yml)
[![Catalog Drift Check](https://github.com/jagguvarma15/agent-blueprints/actions/workflows/catalog-drift.yml/badge.svg)](https://github.com/jagguvarma15/agent-blueprints/actions/workflows/catalog-drift.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Framework Agnostic](https://img.shields.io/badge/framework-agnostic-blue)](./foundations/README.md)
[![Contributions Welcome](https://img.shields.io/badge/contributions-welcome-brightgreen)](./meta/contributing.md)

**The architecture-first design core for AI agents** — the kernel, the patterns (at five levels), and the spec/IR that a generator composes into running agents.

---

This repository teaches you how to *think about and design* agent systems — before you write a single line of code. It covers both LLM workflows (where the developer controls the flow) and agent patterns (where the LLM controls the flow), with an explicit progression showing how one evolves into the other.

Every blueprint is documented across five levels of depth — read only what you need:
- **Concepts** (`overview.md`) — intent, when to use / avoid, the forces. 1–2 pages.
- **Architecture** (`architecture.md`) — the static structure: components, edges, ports.
- **Flow** (`flow.md`) — the runtime behaviour: control flow, steps, termination.
- **Design** (`design.md`) — parameters, quality trade-offs, failure modes, decisions.
- **Implementation** (`implementation.md`) — interfaces, pseudocode, the IR fragment, pitfalls.

Each level pairs a machine-readable <code>&#96;&#96;&#96;yaml level=…&#96;&#96;&#96;</code> block (the generator's source) with prose for humans. The model every blueprint composes onto is [the kernel](./core/overview.md). [`react`](./patterns/react/overview.md) is the fully-worked reference; the remaining entries are migrating to the full level set.

---

## For AI tools

If you're an AI tool (Claude Code, Cursor, GitHub Copilot, agent-scaffold, …) reading this repo, start here:

- [`llms.txt`](./llms.txt) — minimal AI-tool discovery file ([llmstxt.org](https://llmstxt.org/) spec).
- [`agents.md`](./agents.md) — how to programmatically consume the catalog (entry shapes, tier file conventions, pinning to a version).
- [`patterns-catalog.yaml`](./patterns-catalog.yaml) — canonical machine-readable index. Schema in [`PATTERNS_CATALOG_SCHEMA.md`](./PATTERNS_CATALOG_SCHEMA.md).
- [`meta/HOW_TO_ADD_AN_ENTRY.md`](./meta/HOW_TO_ADD_AN_ENTRY.md) — contributor walkthrough, including AI-tool prompts.

---

## The ecosystem: two arms of a generator

`agent-blueprints` and `agent-deployments` are the two **arms** that feed [`agent-scaffold`](https://github.com/jagguvarma15/agent-scaffold) — the engine that composes a selection into a real, running agent:

```mermaid
flowchart LR
  B["agent-blueprints<br/>design core:<br/>kernel · patterns · spec/IR"] --> S["agent-scaffold<br/>compose engine"]
  D["agent-deployments<br/>verified options:<br/>adapters · recipes"] --> S
  S --> R["Running agent<br/>code + server, live"]

  style B fill:#e8f5e9,stroke:#0f6e56
  style D fill:#fff3e0,stroke:#9a6a00
  style S fill:#eeedfe,stroke:#534ab7
  style R fill:#e3f2fd,stroke:#1565c0
```

- **[agent-blueprints](https://github.com/jagguvarma15/agent-blueprints)** *(this repo)* — the **design core**. The [kernel](./core/overview.md) every agent composes onto (Step · Engine · Control-Policy · Run-State · Ports · Cross-cutting), the framework-agnostic patterns / primitives / modifiers documented at five levels (Concepts → Architecture → Flow → Design → Implementation), and the **spec/IR** ([`core/spec/ir.schema.json`](./core/spec/ir.schema.json)) a selection compiles to. *What the agent is and how it's shaped.*
- **[agent-deployments](https://github.com/jagguvarma15/agent-deployments)** — the **verified options**. Adapters per axis (frameworks, model providers, stores, deploy targets) that bind to the kernel's ports, the reliability/ops layer (auth, rate limiting, retries, idempotency, tracing), and production-shaped recipes. *Which concrete options realize each port.*
- **[agent-scaffold](https://github.com/jagguvarma15/agent-scaffold)** — the **composition engine**. Validates a selection, compiles it to the IR, binds each port to a deployments option, and emits a complete, running project. *Cooks the agent.*

> **Boundary.** Blueprints owns the *design-time* shape — what the agent does and how its flow is structured; deployments owns the *operational realization* — the concrete adapters and ops. The kernel's **ports** are the seam where the two meet. See [System Design Heritage](./foundations/system-design-heritage.md).

### How the arms compose

- **[The kernel + IR](./core/overview.md)** — the normalized core a selection compiles to: the [IR schema](./core/spec/ir.schema.json) + a [worked example](./core/spec/example.yaml).
- **[Blueprints → Deployments](./composition/blueprints-to-deployments.md)** — which recipes use which patterns, and what each inherits from the operational layer.
- **[Blueprint → Spec → Scaffold](./composition/blueprint-to-spec-to-scaffold.md)** — an end-to-end walkthrough on one concrete agent.
- **[`patterns-catalog.yaml`](./patterns-catalog.yaml)** — the machine-readable index `agent-deployments` CI consumes; regenerate via `node meta/validate-metadata.js --emit patterns-catalog.yaml`. See [`PATTERNS_CATALOG_SCHEMA.md`](./PATTERNS_CATALOG_SCHEMA.md).

---

## Start Here

| If You... | Read This |
|-----------|-----------|
| Are new to LLM systems | [Foundations](./foundations/README.md) — concepts, terminology, mental models |
| Want the architecture every pattern composes onto | [The Kernel](./core/overview.md) — Step, Engine, Control Policy, Run State, Ports + the IR |
| Need to pick a pattern | [Choosing a Pattern](./foundations/choosing-a-pattern.md) — decision flowchart |
| Want structured LLM pipelines | [Workflows](./workflows/README.md) — 4 pre-agent patterns |
| Want autonomous LLM behavior | [Agent Patterns](./patterns/README.md) — <!-- AUTO:count cohort=patterns filter=category:agent -->10<!-- /AUTO --> agent architectures |
| Are designing a production system | [Composition](./composition/README.md) — how patterns combine |
| Want a production-shaped agent | [Blueprints → Deployments](./composition/blueprints-to-deployments.md) — which patterns power which deployments |
| Want to generate a starter project | [Blueprint → Spec → Scaffold](./composition/blueprint-to-spec-to-scaffold.md) — end-to-end walkthrough |
| Are building a reactive system on a queue or stream | [Event-Driven Agents](./patterns/event_driven/overview.md) — async triggers, idempotency, DLQ |
| Want to avoid common mistakes | [Anti-Patterns](./foundations/anti-patterns.md) — what not to build |
| Need to test your agent system | [Testing Strategies](./foundations/testing-strategies.md) — mock LLMs, evaluation, regression |

## Workflow Patterns

Workflows are orchestrated patterns where **the code controls the flow**. The developer defines the structure; the LLM fills in the content.

<!-- AUTO:cohort-table cohort=patterns filter=category:workflow style=tiers base=./ -->
| Pattern | What It Does | Overview | Design | Implementation |
|---|---|---|---|---|
| **Evaluator-Optimizer** | Generate-evaluate feedback loop that iteratively improves output. | [overview](./patterns/evaluator-optimizer/overview.md) | [design](./patterns/evaluator-optimizer/design.md) | [impl](./patterns/evaluator-optimizer/implementation.md) |
| **Orchestrator-Worker** | LLM decomposes a task and delegates to specialized workers. | [overview](./patterns/orchestrator-worker/overview.md) | [design](./patterns/orchestrator-worker/design.md) | [impl](./patterns/orchestrator-worker/implementation.md) |
| **Parallel Calls** | Concurrent LLM calls on independent inputs, aggregated at the end. | [overview](./patterns/parallel-calls/overview.md) | [design](./patterns/parallel-calls/design.md) | [impl](./patterns/parallel-calls/implementation.md) |
| **Prompt Chaining** | Sequential LLM calls with validation gates between steps. | [overview](./patterns/prompt-chaining/overview.md) | [design](./patterns/prompt-chaining/design.md) | [impl](./patterns/prompt-chaining/implementation.md) |
<!-- /AUTO -->

## Agent Patterns

Agents are systems where **the LLM controls the flow**. The developer provides tools and constraints; the LLM decides what to do.

<!-- AUTO:cohort-table cohort=patterns filter=category:agent style=tiers base=./ -->
| Pattern | What It Does | Evolves From | Overview | Design | Implementation |
|---|---|---|---|---|---|
| **Agentic RAG** | RAG where the agent plans retrievals, decomposes queries, routes across sources, reflects on sufficiency, and enforces citation-bound answers. | RAG, Plan & Execute | [overview](./patterns/agentic_rag/overview.md) | [design](./patterns/agentic_rag/design.md) | [impl](./patterns/agentic_rag/implementation.md) |
| **Event-Driven** | Agents triggered by queue or stream events rather than HTTP requests. | Tool Use | [overview](./patterns/event_driven/overview.md) | [design](./patterns/event_driven/design.md) | [impl](./patterns/event_driven/implementation.md) |
| **Long-Horizon** | Multi-session agent tasks that span hours to weeks; checkpoint-and-resume across crashes, deploys, and external waits. | Saga, Event-Driven | [overview](./patterns/long_horizon/overview.md) | [design](./patterns/long_horizon/design.md) | [impl](./patterns/long_horizon/implementation.md) |
| **Multi-Agent** | Supervisor-worker delegation across multiple autonomous agents. | Orchestrator-Worker, Routing | [overview](./patterns/multi_agent/overview.md) | [design](./patterns/multi_agent/design.md) | [impl](./patterns/multi_agent/implementation.md) |
| **Plan & Execute** | LLM creates a full plan upfront, then executes each step sequentially. | Orchestrator-Worker | [overview](./patterns/plan_and_execute/overview.md) | [design](./patterns/plan_and_execute/design.md) | [impl](./patterns/plan_and_execute/implementation.md) |
| **RAG** | Retrieval-augmented generation: retrieve relevant context before generating. | Parallel Calls | [overview](./patterns/rag/overview.md) | [design](./patterns/rag/design.md) | [impl](./patterns/rag/implementation.md) |
| **ReAct** | Reason-act loop: the LLM reasons, calls a tool, observes, and repeats until done. | Prompt Chaining | [overview](./patterns/react/overview.md) | [design](./patterns/react/design.md) | [impl](./patterns/react/implementation.md) |
| **Reflection** | LLM critiques its own output and self-improves through structured feedback. | Evaluator-Optimizer | [overview](./patterns/reflection/overview.md) | [design](./patterns/reflection/design.md) | [impl](./patterns/reflection/implementation.md) |
| **Routing** | Intent classification dispatches inputs to specialized handlers. | Parallel Calls | [overview](./patterns/routing/overview.md) | [design](./patterns/routing/design.md) | [impl](./patterns/routing/implementation.md) |
| **Saga** | Long-running, multi-step business processes that need compensation when an intermediate step fails. | Tool Use, Prompt Chaining | [overview](./patterns/saga/overview.md) | [design](./patterns/saga/design.md) | [impl](./patterns/saga/implementation.md) |
<!-- /AUTO -->

## Primitives

Primitives are building blocks the agent uses orthogonally to any pattern. Picking primitives is the second of three decisions (pattern → primitives → modifiers) when designing an agent.

<!-- AUTO:cohort-table cohort=primitives style=tiers base=./ -->
| Pattern | What It Does | Evolves From | Overview | Design | Implementation |
|---|---|---|---|---|---|
| **Memory** | Persistent state across sessions: short-term, long-term, and semantic memory. | Prompt Chaining | [overview](./primitives/memory/overview.md) | [design](./primitives/memory/design.md) | [impl](./primitives/memory/implementation.md) |
| **Skills** | File-based, agent-discovered procedural modules. Cheap to ship many; loaded on demand at runtime. | Tool Use | [overview](./primitives/skills/overview.md) | [design](./primitives/skills/design.md) | [impl](./primitives/skills/implementation.md) |
| **Step Log** | A serializable step-log — the agent's run state as an append-only event log for pause / resume / retry / trace. | Tool Use | [overview](./primitives/step_log/overview.md) | [design](./primitives/step_log/design.md) | [impl](./primitives/step_log/implementation.md) |
| **Sub-agents** | Named, role-scoped agent instances spawned by a parent for delimited tasks; each has its own context window, tool grants, and (optionally) model. | Tool Use | [overview](./primitives/sub_agents/overview.md) | [design](./primitives/sub_agents/design.md) | [impl](./primitives/sub_agents/implementation.md) |
| **Tool Use** | Structured function calling with schema-validated tool dispatch. | Prompt Chaining | [overview](./primitives/tool_use/overview.md) | [design](./primitives/tool_use/design.md) | [impl](./primitives/tool_use/implementation.md) |
<!-- /AUTO -->

## Modifiers

Modifiers wrap a chosen pattern with a transformation (gates, overlays). Picking modifiers is the third decision.

<!-- AUTO:cohort-table cohort=modifiers style=tiers base=./ -->
| Pattern | What It Does | Evolves From | Overview | Design | Implementation |
|---|---|---|---|---|---|
| **Guardrails** | Layered input / tool / output policy checks plus a dual-LLM split that breaks the indirect-prompt-injection path. | Tool Use | [overview](./modifiers/guardrails/overview.md) | [design](./modifiers/guardrails/design.md) | [impl](./modifiers/guardrails/implementation.md) |
| **Human in the Loop** | Agent proposes an action; a human approves, denies, or modifies before the action commits. | Tool Use | [overview](./modifiers/human_in_the_loop/overview.md) | [design](./modifiers/human_in_the_loop/design.md) | [impl](./modifiers/human_in_the_loop/implementation.md) |
<!-- /AUTO -->

## How Workflows Become Agents

Each agent pattern evolves from a workflow. When a workflow's conditional logic becomes too complex, it's time to let the LLM make those decisions.

```mermaid
graph LR
    PC[Prompt Chaining] -->|"+ dynamic tools"| ReAct[ReAct]
    PC -->|"+ function schemas"| TU[Tool Use]
    PC -->|"+ persistence"| Mem[Memory]
    PAR[Parallel Calls] -->|"+ retrieval"| RAG[RAG]
    PAR -->|"+ classification"| Route[Routing]
    OW[Orchestrator-Worker] -->|"+ planning"| PE["Plan & Execute"]
    OW -->|"+ agent workers"| MA[Multi-Agent]
    Route -->|"+ agent workers"| MA
    EO[Evaluator-Optimizer] -->|"+ self-critique"| Ref[Reflection]
    TU -->|"+ event source"| ED[Event-Driven]
    TU -->|"+ compensation"| Saga[Saga]
    TU -->|"+ approval gate"| HITL[Human in the Loop]

    style PC fill:#e8f5e9
    style PAR fill:#e8f5e9
    style OW fill:#e8f5e9
    style EO fill:#e8f5e9
    style ReAct fill:#fff3e0
    style TU fill:#fff3e0
    style Mem fill:#fff3e0
    style RAG fill:#fff3e0
    style Route fill:#fff3e0
    style PE fill:#fff3e0
    style MA fill:#fff3e0
    style Ref fill:#fff3e0
    style ED fill:#fff3e0
    style Saga fill:#fff3e0
    style HITL fill:#fff3e0
```

Each agent pattern includes an [evolution.md](./patterns/react/evolution.md) document that traces this bridge in detail.

## Repository Structure

```
agent-blueprints/
├── core/                 # The kernel every blueprint composes onto:
│                           Step/Engine/Control-Policy/Run-State/Ports + the IR
│                           (spec/ir.schema.json) and interface stubs
├── foundations/          # Core concepts, terminology, pattern selection
├── patterns/             # Flow shapes: agent (LLM-controlled) + workflow
│                           (code-controlled), split by the `category` field
├── primitives/           # Building blocks the agent uses
│                           (tool_use, memory, skills, sub_agents)
├── modifiers/            # Transformations layered on a pattern
│                           (guardrails, human_in_the_loop)
├── composition/          # How patterns + primitives + modifiers combine
├── meta/                 # Contributing, style guide, roadmap
└── code/                 # Reference implementations under
                            patterns/*/code/, primitives/*/code/, modifiers/*/code/
```

> **Three-tier taxonomy.** Picking an agent shape is three orthogonal decisions: one pattern + N primitives + N modifiers. See [`foundations/choosing-a-pattern.md`](./foundations/choosing-a-pattern.md) for the picker. The machine-readable index is [`patterns-catalog.yaml`](./patterns-catalog.yaml) (schema v2).

## Design Principles

1. **Architecture-first** — Teach readers to design before they build
2. **Five-level depth** — Concepts → Architecture → Flow → Design → Implementation. Read only what you need.
3. **Pattern + primitives + modifiers** — Three orthogonal decisions, not one. Patterns describe flow shape; primitives are building blocks; modifiers are transforms layered on top.
4. **Workflows → Agents** — Workflows (code-controlled flow) are the foundation; agent patterns (LLM-controlled flow) build on them. Both live in `patterns/` distinguished by category.
5. **Generalized, not use-case-bound** — Patterns are abstract and composable.
6. **Framework-agnostic** — No provider lock-in. The LLM is a swappable layer.

## Contributing

See the [Contributing Guide](./meta/contributing.md) and [Style Guide](./meta/style-guide.md).

## Roadmap

The knowledge base, framework-agnostic Python and TypeScript reference implementations for every pattern, and the documentation website are delivered. Advanced patterns and scaffolding tooling are ongoing — see the [full roadmap](./ROADMAP.md).

## License

Released under the [MIT License](./LICENSE). Copyright (c) 2026 Jagadesh Varma Nadimpalli.
