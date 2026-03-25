# Changelog

## 2026-03-25 — Phase 1: Documentation-First Restructure

### Added
- `/foundations/` — Core concepts, terminology, anatomy of an agent, pattern selection guide with decision flowchart
- `/workflows/` — 4 workflow patterns (prompt chaining, parallel calls, orchestrator-worker, evaluator-optimizer) with 3-tier documentation
- `/patterns/` — 8 agent patterns (ReAct, plan & execute, tool use, memory, RAG, reflection, routing, multi-agent) with 3-tier documentation
- Evolution bridges (`evolution.md`) for each agent pattern showing the workflow-to-agent transition
- `/composition/` — Combination matrix and reference architectures
- `/meta/` — Contributing guide, style guide, roadmap, changelog

### Changed
- Repository philosophy: shifted from code-first blueprints to architecture-first documentation
- README.md: rewritten to reflect documentation-first approach
- `/patterns/` directory: replaced pattern reference docs with full 3-tier pattern documentation

### Archived
- Previous code implementations moved to `legacy/` (blueprints, CLI, website, scripts)
- Original CI/CD workflows archived; replaced with documentation-focused validation
