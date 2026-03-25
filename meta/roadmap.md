# Roadmap

This repository is being restructured in phases. Here's what's planned.

## Phase 1: Documentation-First Knowledge Base (Current)

Restructure the repo from code-first blueprints to an architecture-first documentation system.

**Deliverables:**
- [x] Foundations section (terminology, anatomy of an agent, pattern selection guide)
- [x] 4 workflow patterns (prompt chaining, parallel calls, orchestrator-worker, evaluator-optimizer)
- [x] 8 agent patterns (ReAct, plan & execute, tool use, memory, RAG, reflection, routing, multi-agent)
- [x] 3-tier documentation for each pattern (overview, design, implementation)
- [x] Evolution bridges from workflows to agent patterns
- [x] Composition section (combination matrix, reference architectures)
- [x] Existing code archived under `legacy/`

## Phase 2: Reference Implementations

Add working code implementations alongside the documentation.

**Planned:**
- Python and TypeScript implementations for each pattern
- Language-agnostic interfaces matching the pseudocode from Tier 3 docs
- Test suites with LLM stubs for CI
- Docker Compose environments for patterns requiring infrastructure (vector stores, etc.)

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

Rebuild developer tools around the new structure.

**Planned:**
- Documentation website (rebuilt around the 3-tier structure)
- CLI tool for scaffolding pattern implementations
- Interactive pattern selection guide
- VS Code extension for one-click scaffold

## How to Influence the Roadmap

Open an issue or start a discussion on GitHub. We prioritize based on community interest and contribution activity.
