# Roadmap

## Phase 1: Documentation-First Knowledge Base ✓

Restructured the repo from code-first blueprints to an architecture-first documentation system.

**Delivered:**
- [x] Foundations section (terminology, anatomy of an agent, pattern selection guide, plus security & safety, hallucination & grounding, evals & quality, cost & model selection, frameworks & integrations)
- [x] 4 workflow patterns (prompt chaining, parallel calls, orchestrator-worker, evaluator-optimizer)
- [x] Agent patterns (ReAct, RAG, Reflection, Routing, Multi-Agent, Event-Driven, Saga, Plan & Execute, and more — see [`patterns-catalog.yaml`](patterns-catalog.yaml) for the canonical set)
- [x] 3-tier documentation for each pattern (overview, design, implementation)
- [x] Supplementary docs for each pattern (observability, cost & latency)
- [x] Evolution bridges from workflows to agent patterns
- [x] Composition section (combination matrix, anti-compositions, reference architectures, blueprints-to-deployments, blueprint-to-spec-to-scaffold)

## Phase 2: Reference Implementations (In Progress)

Add working code implementations alongside the documentation.

**Delivered:**
- [x] Python implementations for all 11 agent patterns (`patterns/{name}/code/python/`)
- [x] Python implementations for all 4 workflow patterns (`workflows/{name}/code/python/`)
- [x] Language-agnostic interfaces matching the pseudocode from Tier 3 docs

**Remaining:**
- [ ] TypeScript implementations for each pattern
- [ ] Formal test suites with LLM stubs for CI
- [ ] Docker Compose environments for patterns requiring infrastructure (vector stores, etc.)

## Phase 3: Advanced Patterns

Expand coverage to more specialized and emerging patterns.

**Delivered:**
- [x] Long-horizon agents (`patterns/long_horizon/`) — checkpointing, resume, multi-session tasks, deep-agents shape
- [x] Agentic RAG (`patterns/agentic_rag/`) — query decomposition, multi-source routing, self-correcting retrieval, citation-bound answers
- [x] Guardrails modifier (`modifiers/guardrails/`) — layered input / tool / output policy + dual-LLM split
- [x] Sub-agents primitive (`primitives/sub_agents/`) — role-scoped agent instances with isolated context windows
- [x] Context Engineering foundation (`foundations/context-engineering.md`)

**Candidates:**
- Tree of Thoughts / LATS (tree-search reasoning)
- Debate and critique (multi-agent adversarial reasoning)
- Autonomous coding agents (code generation, testing, deployment)

## Phase 4: Tooling and Developer Experience

**Delivered:**
- [x] Documentation website with multi-tier navigation, search, pattern explorer, and comparison tool

**Remaining:**
- [ ] CLI tool for scaffolding pattern implementations
- [ ] VS Code extension for one-click scaffold

## Scope Decisions

Decisions worth recording so they don't get re-litigated. See [System Design Heritage](foundations/system-design-heritage.md) for the full reasoning.

- **Reliability blueprints live in `agent-deployments`, not here.** Four reliability patterns (Circuit Breaker, Retry with Exponential Backoff, Idempotency, Distributed Tracing) are planned for the sister repo. They're operational concerns shared by every cognitive pattern, not new cognitive patterns themselves. Blueprints stays focused on the LLM-pattern layer.
- **Generic vs. domain-specific category axis: deferred.** Every pattern in this repo is currently generic (the restaurant rebooking inside Saga is an illustrative example, not a domain pattern). Adding a `domain`/`generic` axis to `metadata.json`, the website, and the directory layout is premature scaffolding. Revisit when at least two domain-specific patterns exist — and consider hosting them in `agent-deployments` instead, since that repo already carries production-shaped, domain-bound specs.

## How to Influence the Roadmap

Open an issue or start a discussion on GitHub. We prioritize based on community interest and contribution activity.
