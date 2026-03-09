<div align="center">

# agent-blueprints

[![GitHub Stars](https://img.shields.io/github/stars/jvarma/agent-blueprints?style=flat-square&logo=github)](https://github.com/jvarma/agent-blueprints/stargazers)
[![CI](https://img.shields.io/github/actions/workflow/status/jvarma/agent-blueprints/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/jvarma/agent-blueprints/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/jvarma/agent-blueprints?style=flat-square)](./LICENSE)
[![npm version](https://img.shields.io/npm/v/agent-blueprints?style=flat-square&logo=npm)](https://www.npmjs.com/package/agent-blueprints)

**The definitive open-source reference for production-ready AI agent system design.**

</div>

---

`agent-blueprints` is a curated collection of battle-tested, framework-agnostic blueprints for building AI agent systems that are ready for production. Each blueprint ships with a full architecture diagram, dual implementations in Python and TypeScript, test suites, and a Docker Compose environment — giving you everything you need to go from idea to deployed agent in minutes, not days. Whether you are an AI engineer exploring agentic patterns for the first time or an experienced team standardising on a proven reference architecture, this repo is the single source of truth.

---

## Blueprints

Implemented now: **01/04/07**  
Planned: **02/03/05/06/08/09/10**

### Implemented in this repo

| # | Blueprint | Complexity | Pattern | Python | TypeScript |
|---|---|---|---|---|---|
| 01 | [ReAct Agent](./blueprints/01-react-agent/) | Beginner | Orchestration | [python](./blueprints/01-react-agent/python/) | [typescript](./blueprints/01-react-agent/typescript/) |
| 04 | [Multi Agent Supervisor](./blueprints/04-multi-agent-supervisor/) | Intermediate | Multi-agent | [python](./blueprints/04-multi-agent-supervisor/python/) | [typescript](./blueprints/04-multi-agent-supervisor/typescript/) |
| 07 | [RAG Basic](./blueprints/07-rag-basic/) | Beginner | RAG | [python](./blueprints/07-rag-basic/python/) | [typescript](./blueprints/07-rag-basic/typescript/) |

### Planned blueprints

| # | Blueprint | Complexity | Pattern | Status |
|---|---|---|---|---|
| 02 | Plan & Execute | Intermediate | Orchestration | Planned |
| 03 | Reflexion | Intermediate | Orchestration | Planned |
| 05 | Multi Agent Parallel | Intermediate | Multi-agent | Planned |
| 06 | Memory Agent | Intermediate | Memory | Planned |
| 08 | RAG Advanced | Advanced | RAG | Planned |
| 09 | Tool Calling | Beginner | Tools | Planned |
| 10 | Human in the Loop | Intermediate | Control flow | Planned |

### Complexity guide

| Level | Description |
|-------|-------------|
| **Beginner** | Single-agent, minimal dependencies, ideal starting point |
| **Intermediate** | Multi-step reasoning, external state, or coordination between agents |
| **Advanced** | Production-scale concerns: caching, re-ranking, hybrid retrieval, observability |

---

## Quickstart

The fastest way to scaffold a blueprint into your own project:

```bash
npx agent-blueprints@latest init
```

The interactive CLI will ask you which blueprint you want, which language (Python or TypeScript), and where to place the generated files. You can also pass flags directly:

```bash
# Scaffold blueprint 04 in TypeScript into ./my-agent
npx agent-blueprints@latest init --blueprint 04 --lang typescript --out ./my-agent
```

> **Requirements:** Node 20+. Python blueprints additionally require Python 3.11+ and [uv](https://github.com/astral-sh/uv). TypeScript blueprints require [pnpm](https://pnpm.io/) 9+.

---

## Project structure

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
├── .github/
│   ├── workflows/
│   │   └── ci.yml
│   └── ISSUE_TEMPLATE/
│       └── new-blueprint.yml
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
└── LICENSE
```

Every blueprint directory is self-contained: you can copy any single folder into your project and it works without touching the rest of the repo.

---

## Why agent-blueprints?

Most AI agent tutorials stop at toy examples. `agent-blueprints` is different:

- **Framework-agnostic** — Implementations avoid tying you to a single SDK. Where a framework adds genuine value (e.g. LangGraph for stateful graphs) it is used, but always as a thin, swappable layer.
- **Production-first** — Each blueprint includes error handling, retries, structured logging, and environment-variable-driven configuration out of the box.
- **Parity across languages** — Python and TypeScript implementations are functionally equivalent and maintained together, so you can compare idioms directly.
- **Tested** — Every blueprint ships with a unit test suite and, where applicable, integration tests that run against a local LLM stub so CI never hits a paid API.
- **Composable** — Blueprints are designed to be combined. The Memory Agent slot cleanly into the Multi-Agent Supervisor, for example.

---

## Running a blueprint locally

### Python (using uv)

```bash
cd blueprints/01-react-agent/python
uv sync
cp .env.example .env        # add your API keys
uv run python agent.py
uv run pytest
```

### TypeScript (using pnpm)

```bash
cd blueprints/01-react-agent/typescript
pnpm install
cp .env.example .env        # add your API keys
pnpm dev
pnpm test
```

### Docker Compose (full stack)

```bash
cd blueprints/01-react-agent
docker compose up
```

The Compose file spins up the agent alongside any required backing services (vector store, Redis, etc.) with a single command.

---

## Contributing

Contributions are very welcome. If you have an idea for a new blueprint, found a bug, or want to improve an existing implementation, please read the [Contributing Guide](./CONTRIBUTING.md) first — it explains the blueprint requirements checklist, code standards, and PR process.

For major proposals (new blueprints or significant refactors), please [open an issue](https://github.com/jvarma/agent-blueprints/issues/new/choose) using the **New Blueprint** template before writing code.

Please note that this project adheres to the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

---

## Roadmap

- [ ] Blueprint 11: Long-horizon task agent with checkpointing
- [ ] Blueprint 12: Evaluator-Optimizer loop
- [ ] Blueprint 13: Agentic RAG (query decomposition + self-correction)
- [ ] VS Code extension for one-click scaffold
- [ ] OpenTelemetry tracing guide for all blueprints

Track progress and vote on priorities in the [GitHub Discussions](https://github.com/jvarma/agent-blueprints/discussions).

---

## License

Released under the [MIT License](./LICENSE). Copyright (c) 2026 Jagadesh Varma Nadimpalli.

You are free to use, modify, and distribute these blueprints in your own projects — commercial or otherwise — with no strings attached. Attribution is appreciated but not required.
