---
id: intro
title: Introduction
sidebar_position: 1
description: Agent Blueprints — production-ready AI agent system design patterns, blueprints, and reference architectures for Python and TypeScript.
---

# Agent Blueprints

**The definitive open-source reference for production-ready AI agent system design.**

`agent-blueprints` is a curated collection of battle-tested, framework-agnostic blueprints for building AI agent systems that are ready for production. Each blueprint ships with a full architecture diagram, dual implementations in Python and TypeScript, test suites, and a Docker Compose environment — giving you everything you need to go from idea to deployed agent in minutes, not days.

---

## What is Agent Blueprints?

Agent Blueprints bridges the gap between toy tutorials and real production systems. Every blueprint covers the full stack:

- **Architecture diagram** — an annotated Mermaid diagram that explains the data flow and design decisions
- **Python implementation** — using `uv` for dependency management, with full type annotations
- **TypeScript implementation** — using `pnpm`, functionally equivalent to the Python version
- **Test suite** — unit tests and integration tests that run against a local LLM stub (no paid API required in CI)
- **Docker Compose** — one-command local environment with all required backing services

The blueprints are designed to be **composable**: the Memory Agent slots cleanly into the Multi-Agent Supervisor, the RAG Advanced blueprint adds re-ranking on top of RAG Basic, and so on.

---

## Who is it for?

This resource is aimed at **intermediate to advanced engineers** who:

- Already understand the basics of LLM prompting and API calls
- Are building or evaluating AI agents for production workloads
- Want reference implementations they can actually copy into their own codebase
- Need to compare Python and TypeScript idioms side-by-side
- Prefer framework-agnostic patterns that don't lock them into a single SDK

If you are completely new to LLMs, we recommend starting with the [Anthropic documentation](https://docs.anthropic.com) and returning here when you are ready to build agents.

---

## How to Navigate

The documentation is split into three sections:

| Section | What you'll find |
|---------|-----------------|
| **[Blueprints](/blueprints)** | 3 implemented blueprints today (01, 04, 07) with additional entries planned. Start here if you want to scaffold something quickly. |
| **[Patterns](/patterns)** | Conceptual guides for each design pattern — when to use it, trade-offs, variations. |
| **[Reference Architectures](/architectures)** | End-to-end system designs that combine multiple blueprints and patterns into production deployments. |

**Typical flow:** Read the Pattern guide to understand the concept → study the Blueprint to see a concrete implementation → consult the Reference Architecture to see how it fits into a larger system.

---

## Quick Start

The fastest way to scaffold a blueprint into your own project:

```bash
npx agent-blueprints@latest init
```

The interactive CLI will ask which blueprint you want, which language (Python or TypeScript), and where to place the generated files.

You can also pass flags directly:

```bash
# Scaffold blueprint 04 in TypeScript into ./my-agent
npx agent-blueprints@latest init --blueprint 04 --lang typescript --out ./my-agent
```

### Requirements

| Runtime | Minimum version |
|---------|----------------|
| Node.js | 20+ |
| Python | 3.11+ (Python blueprints) |
| pnpm | 9+ (TypeScript blueprints) |
| uv | latest (Python blueprints) |
| Docker | 24+ (optional, for Compose) |

---

## Blueprint Overview

Implemented now: **01/04/07**  
Planned: **02/03/05/06/08/09/10**

| # | Blueprint | Complexity | Pattern | Description |
|---|-----------|------------|---------|-------------|
| 01 | [ReAct Agent](https://github.com/jvarma/agent-blueprints/tree/main/blueprints/01-react-agent) | Beginner | Orchestration | Reason + Act loop with tool use; the foundational agentic pattern |
| 02 | Plan & Execute (Planned) | Intermediate | Orchestration | Separate planner and executor agents; better for long-horizon tasks |
| 03 | Reflexion (Planned) | Intermediate | Orchestration | Self-critique and iterative refinement loop for improved output quality |
| 04 | [Multi-Agent Supervisor](https://github.com/jvarma/agent-blueprints/tree/main/blueprints/04-multi-agent-supervisor) | Intermediate | Multi-agent | Central supervisor delegates tasks to specialised sub-agents |
| 05 | Multi-Agent Parallel (Planned) | Intermediate | Multi-agent | Fan-out to parallel agents then aggregate results; maximises throughput |
| 06 | Memory Agent (Planned) | Intermediate | Memory | Persistent short- and long-term memory with semantic search |
| 07 | [RAG Basic](https://github.com/jvarma/agent-blueprints/tree/main/blueprints/07-rag-basic) | Beginner | RAG | Naive retrieve-then-generate pipeline; simplest starting point for RAG |
| 08 | RAG Advanced (Planned) | Advanced | RAG | Hybrid retrieval, re-ranking, query decomposition, and self-correction |
| 09 | Tool Calling (Planned) | Beginner | Tools | Structured tool definitions, parallel calls, error handling, and retries |
| 10 | Human-in-the-Loop (Planned) | Intermediate | Control Flow | Interrupt execution to request human approval or clarification |

### Complexity guide

| Level | Description |
|-------|-------------|
| **Beginner** | Single-agent, minimal dependencies, ideal starting point |
| **Intermediate** | Multi-step reasoning, external state, or coordination between agents |
| **Advanced** | Production-scale concerns: caching, re-ranking, hybrid retrieval, observability |

---

## Technology Stack

Blueprints are **framework-agnostic by default**. Where a framework adds genuine value it is used as a thin, swappable layer.

| Concern | Python | TypeScript |
|---------|--------|------------|
| Package management | [uv](https://github.com/astral-sh/uv) | [pnpm](https://pnpm.io/) |
| LLM API | [anthropic-sdk-python](https://github.com/anthropics/anthropic-sdk-python) | [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript) |
| Stateful graphs | [LangGraph](https://langchain-ai.github.io/langgraph/) (opt-in) | [LangGraph.js](https://langchain-ai.github.io/langgraphjs/) (opt-in) |
| Vector store | [Chroma](https://www.trychroma.com/) | [Chroma](https://www.trychroma.com/) |
| Structured output | [Pydantic](https://docs.pydantic.dev/) | [Zod](https://zod.dev/) |
| Testing | [pytest](https://pytest.org/) | [Vitest](https://vitest.dev/) |
| Observability | [OpenTelemetry](https://opentelemetry.io/) | [OpenTelemetry](https://opentelemetry.io/) |

---

## Project Structure

```
agent-blueprints/
├── blueprints/
│   ├── 01-react-agent/
│   │   ├── README.md             # Blueprint overview & usage
│   │   ├── architecture.md       # Mermaid diagram + design rationale
│   │   ├── python/
│   │   │   ├── agent.py
│   │   │   ├── pyproject.toml
│   │   │   └── tests/
│   │   ├── typescript/
│   │   │   ├── src/agent.ts
│   │   │   ├── package.json
│   │   │   └── tests/
│   │   └── docker-compose.yml
│   └── ...                       # Additional blueprints are added incrementally
├── packages/
│   └── cli/                      # npx agent-blueprints CLI (TypeScript)
├── website/                      # This documentation site
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
└── LICENSE
```

Every blueprint directory is **self-contained**: copy any single folder into your project and it works without touching the rest of the repo.

---

## Contributing

Contributions are very welcome. Read the [Contributing Guide](https://github.com/jvarma/agent-blueprints/blob/main/CONTRIBUTING.md) before submitting a PR — it explains the blueprint requirements checklist, code standards, and the review process.

For major proposals, [open an issue](https://github.com/jvarma/agent-blueprints/issues/new/choose) using the **New Blueprint** template before writing code.
