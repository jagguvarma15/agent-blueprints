# Roadmap

## Phase 1: Documentation-First Knowledge Base ✓

Restructured the repo from code-first blueprints to an architecture-first documentation system.

**Delivered:**
- [x] Foundations section (terminology, anatomy of an agent, pattern selection guide)
- [x] 4 workflow patterns (prompt chaining, parallel calls, orchestrator-worker, evaluator-optimizer)
- [x] 8 agent patterns (ReAct, plan & execute, tool use, memory, RAG, reflection, routing, multi-agent)
- [x] 3-tier documentation for each pattern (overview, design, implementation)
- [x] Supplementary docs for each pattern (observability, cost & latency)
- [x] Evolution bridges from workflows to agent patterns
- [x] Composition section (combination matrix, reference architectures)
- [x] Existing code archived under `legacy/`

## Phase 2: Reference Implementations (In Progress)

Add working code implementations alongside the documentation.

**Delivered:**
- [x] Python implementations for all 8 agent patterns (`patterns/{name}/code/python/`)
- [x] Language-agnostic interfaces matching the pseudocode from Tier 3 docs

**Remaining:**
- [ ] Python implementations for 4 workflow patterns
- [ ] TypeScript implementations for each pattern
- [ ] Formal test suites with LLM stubs for CI
- [ ] Docker Compose environments for patterns requiring infrastructure (vector stores, etc.)

## Phase 3: Advanced Patterns

Expand coverage to more specialized and emerging patterns.

**Candidates:**
- Human-in-the-loop (approval gates, intervention points)
- Tree of Thoughts / LATS (tree-search reasoning)
- Debate and critique (multi-agent adversarial reasoning)
- Long-horizon agents (checkpointing, recovery, multi-session tasks)
- Agentic RAG (query decomposition, self-correcting retrieval)
- Autonomous coding agents (code generation, testing, deployment)

## Phase 4: Tooling and Developer Experience

**Delivered:**
- [x] Documentation website with multi-tier navigation, search, pattern explorer, and comparison tool

**Remaining:**
- [ ] CLI tool for scaffolding pattern implementations
- [ ] VS Code extension for one-click scaffold

## How to Influence the Roadmap

Open an issue or start a discussion on GitHub. We prioritize based on community interest and contribution activity.
