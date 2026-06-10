# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Context Engineering foundation** (`foundations/context-engineering.md`). Promotes "context-as-finite-resource" from a memory-doc subtopic to a first-class architectural framing: the four levers (select/compress/prune/persist), memory hierarchy, per-pattern context shape, context-window awareness, compaction, and budgets. Cross-linked from `foundations/README.md` and `primitives/memory/overview.md`.
- **Guardrails modifier** (`modifiers/guardrails/`). The second modifier (alongside `human_in_the_loop`). Layered input / tool / output policy checks plus an explicit dual-LLM split (privileged actor + quarantined reader) that breaks the indirect-prompt-injection path. Ships the six tier docs (overview / design / implementation / evolution / observability / cost-and-latency), `schemas/state.py`, and two typed prompts (`quarantined-summarizer.md`, `policy-rewriter.md`). `appliesTo: [any]`.
- **Sub-agents primitive** (`primitives/sub_agents/`). The fourth primitive (alongside `tool_use`, `memory`, `skills`). Models named, role-scoped agent instances with their own context windows, tool grants, and (optionally) models. The 2026 production default for `multi_agent` workers and the unit-of-work inside `plan_and_execute` and `react`. Ships six tier docs, `schemas/state.py` (`SubAgentSpec`, `ContextEnvelope`, `SubAgentInvocation`, `SubAgentResult`, `SubAgentsState`), and two typed prompts (`delegator.md`, `sub-agent-base.md`).
- **Long-Horizon agent pattern** (`patterns/long_horizon/`). Multi-session tasks that span hours-to-weeks; checkpoint-and-resume across crashes, deploys, and external waits. Distinct from `saga` (compensation) and `memory` (storage). The deep-agents shape (planner + virtual filesystem + sub-agents) is the canonical composition. Ships six tier docs, `schemas/state.py` (`LongHorizonState`, `Plan`, `StepRecord`, `EventLogEntry`, `Checkpoint`), and the `planner.md` prompt. Evolves from `saga` + `event_driven`.
- **Agentic RAG agent pattern** (`patterns/agentic_rag/`). RAG where the agent plans retrievals, decomposes queries, routes across sources, reflects on sufficiency, enforces citation-bound answers, and cross-checks across sources to defend against single-source RAG poisoning. Ships six tier docs, `schemas/state.py` (`SubQuestion`, `RetrievalAttempt`, `EvidenceChunk`, `CrossSourceConflict`, `Citation`, `VerificationResult`, `AgenticRagState`), and two typed prompts (`decomposer.md`, `sufficiency-reflector.md`). Evolves from `rag` + `plan_and_execute`.

### Changed
- `patterns-catalog.yaml` regenerated (now 14 Patterns + 4 Primitives + 2 Modifiers; derived workflows view unchanged at 4).
- `website/src/data/patterns.ts` regenerated to register the new entries.
- README.md, `patterns/README.md`, `primitives/README.md`, `modifiers/README.md`, and `foundations/choosing-a-pattern.md` auto-blocks regenerated to include the new entries.

## [0.2.330] - 2026-06-09

First tagged release. Bundles two work streams: the three-tier taxonomy refactor (12 patterns + 3 primitives + 1 modifier under a single `taxonomy.yaml` source of truth, with byte-identical drift-checked generators) and an AI-tool-discoverability hygiene round (`llms.txt`, `agents.md`, root-level CHANGELOG/ROADMAP, action version unification, Conventional Commits convention).

### Added
- **Three-tier taxonomy** (`patterns/`, `primitives/`, `modifiers/`) backed by a new `taxonomy.yaml` at the repo root. Adding a new cohort (e.g. `guardrails/`) is now one entry in `taxonomy.yaml` + a directory — no code change. The validator, catalog emitter, schemas test, docs generator, and website data generator all read taxonomy.yaml. Catalog `schema_version` bumped to 2; `workflows[]` becomes a derived view of `patterns[]` for backward compat.
- **Generic taxonomy infrastructure**: new `meta/generate-docs.js` (replaces `AUTO:` marker blocks across markdown), new `meta/generate-website-data.js` (regenerates `website/src/data/patterns.ts` from the catalog), refactored `meta/validate-metadata.js` to be taxonomy-driven. Drift gates in `catalog-drift.yml` now cover catalog + docs + website TS together.
- **Contributor manual** `meta/HOW_TO_ADD_AN_ENTRY.md` — quick-start commands, per-cohort recipes, prompts for Claude Code / Cursor / Copilot, post-AI verification checklist. `CONTRIBUTING.md` + `meta/contributing.md` refreshed to lead with the three-step flow.
- Per-cohort READMEs at `primitives/README.md` and `modifiers/README.md`.
- **AI-tool discovery** files at repo root: `llms.txt` (llmstxt.org spec) + `agents.md` (consumer-focused guide for AI tools reading the catalog).
- CHANGELOG.md and ROADMAP.md moved to repo root (from `meta/`). Stubs remain at the old paths.
- `patterns-catalog.yaml` — top-level machine-readable index aggregating every pattern + primitive + modifier + composition edge into one file. Generated by `node meta/validate-metadata.js --emit patterns-catalog.yaml`. Primary downstream consumer is the `agent-deployments` CI generator. See [`PATTERNS_CATALOG_SCHEMA.md`](PATTERNS_CATALOG_SCHEMA.md).
- `meta/validate-metadata.js --emit <path>` flag — aggregates validated metadata into the catalog. Without the flag, validator behavior is unchanged.
- `.github/workflows/catalog-drift.yml` — hard CI gate that regenerates the catalog on every PR and fails if the committed file diverges.
- `composition/anti-compositions.md` — standalone reference for pattern pairs that fight, overlap, or leak state, with concrete what-to-use-instead guidance.
- Two new reference architectures in `composition/reference-architectures.md`: high-stakes content moderation pipeline (Routing + Tool Use + Reflection + HITL) and event-driven ingestion + RAG enrichment (Event-Driven + Tool Use + RAG + Memory).
- `meta/contributing.md` — "Good first contributions" section listing newcomer-friendly tasks.
- Sitemap (`/sitemap-index.xml`) and RSS feed (`/changelog.rss`) on the documentation website.
- Refreshed `.github/ISSUE_TEMPLATE/blueprint-proposal.yml` — current "pattern" terminology and added when-to-use / when-NOT-to-use fields.

## [0.3.0] - 2026-05-31

Six-PR improvement series. Closes the three-repo connectivity gap, fills the security/production-realities content layer, and evens out pattern depth.

### Added
- **`agent-scaffold` connectivity.** `composition/blueprints-to-deployments.md` and `composition/blueprint-to-spec-to-scaffold.md` — reverse-lookup table and end-to-end walkthrough making `agent-deployments` and `agent-scaffold` reachable from this repo. README lifecycle diagram replaces the static three-repo block.
- **Frameworks & MCP map.** `foundations/frameworks-and-integrations.md` — 15 patterns × 6 frameworks/MCP. New "MCP and tool registries" subsection in `patterns/tool_use/design.md`.
- **Security & production foundations** (4 new docs): `foundations/security-and-safety.md`, `foundations/hallucination-and-grounding.md`, `foundations/evals-and-quality.md`, `foundations/cost-and-model-selection.md`.
- **Per-pattern "Production concerns" subsection** added to all 15 workflow + pattern design docs. Each names a pattern-specific surface for prompt injection, hallucination, cost, rate limiting/retries, idempotency, observability.
- **"When NOT to use" subsection** added to all 15 overview.md files with 3 concrete anti-cases each, seeded from `foundations/choosing-a-pattern.md`.
- **"Next steps" footer** added to all 15 overview.md files pointing at the deployment mapping and scaffold walkthrough.
- **CI rigor.** `.github/workflows/docs.yml` now does dynamic pattern validation and runs `npm run build` against the website on every PR. `validate-metadata.js` cross-checks `patterns.ts` registration. `.github/CODEOWNERS` and `.github/dependabot.yml` added.

### Changed
- `patterns/multi_agent/design.md` expanded from 105 → 210 lines and pinned as the canonical exemplar in `meta/contributing.md` and `meta/style-guide.md`. Now the deepest pattern doc, exceeding `saga/design.md`.
- 8 thin design docs (memory, reflection, routing, plan-and-execute, react, tool-use, rag, parallel-calls) expanded to consistent ~120–165 line floor with explicit Observability Hooks subsections.
- `website/src/data/patterns.ts` — registered `saga` and `human-in-the-loop` (were missing).
- `SECURITY.md` — adds adopter-facing security guidance pointing to the new foundations doc.

### Fixed
- `docs.yml` shell loop now covers all 11 agent patterns (previously hardcoded to 8; `saga`, `human-in-the-loop`, `event-driven` were uncovered).

## [0.2.0] - 2026-04 (approximate)

Pattern additions and website maturity.

### Added
- `patterns/saga/` — long-running multi-step processes with compensation.
- `patterns/event_driven/` — agents triggered by queue or stream events; idempotency, DLQ, replay.
- `patterns/human_in_the_loop/` — agent proposes, human approves, modifies, or denies before commit.
- Reference Python implementations under `patterns/*/code/python/` and `workflows/*/code/python/`.
- Astro 4.x documentation website at `website/`. Interactive React Flow canvases (HeroViz, PlaygroundCanvas, EvolutionExplorer), Mermaid rendering, Pagefind full-text search. Deploys to GitHub Pages on push to `main`.
- Per-pattern `observability.md` and `cost-and-latency.md` files for all patterns.

## [0.1.0] - 2026-03-25

Phase 1: Documentation-First Restructure.

### Added
- `/foundations/` — Core concepts, terminology, anatomy of an agent, pattern selection guide with decision flowchart.
- `/workflows/` — 4 workflow patterns (prompt chaining, parallel calls, orchestrator-worker, evaluator-optimizer) with 3-tier documentation.
- `/patterns/` — 8 agent patterns (ReAct, plan & execute, tool use, memory, RAG, reflection, routing, multi-agent) with 3-tier documentation.
- Evolution bridges (`evolution.md`) for each agent pattern showing the workflow-to-agent transition.
- `/composition/` — Combination matrix and reference architectures.
- `/meta/` — Contributing guide, style guide, roadmap, changelog.

### Changed
- Repository philosophy: shifted from code-first blueprints to architecture-first documentation.
- `README.md`: rewritten to reflect documentation-first approach.
- `/patterns/` directory: replaced pattern reference docs with full 3-tier pattern documentation.

### Removed
- Previous code implementations moved to `legacy/` (blueprints, CLI, website, scripts).
- Original CI/CD workflows archived; replaced with documentation-focused validation.
