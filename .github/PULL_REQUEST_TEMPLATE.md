# Pull Request

## Description

<!-- Summarise the changes and the motivation. Link any related issues. -->

Closes #

---

## Type of Change

- [ ] New pattern (adds overview, design, implementation, and evolution docs)
- [ ] Improve existing documentation (fixes, clarifications, new examples)
- [ ] Website change (layout, components, navigation, styling)
- [ ] Reference implementation (code under `patterns/*/code/`)
- [ ] CI / tooling change
- [ ] Other (describe below)

---

## Documentation Checklist

Complete this section when adding or significantly updating a pattern.

- [ ] `overview.md` — architecture diagram, how it works, minimal example, tradeoffs, when to use
- [ ] `design.md` — component breakdown, data flow, error handling, scaling considerations
- [ ] `implementation.md` — pseudocode, interfaces, testing strategy, common pitfalls
- [ ] `evolution.md` — bridge from parent workflow (agent patterns only)
- [ ] `observability.md` — key metrics, trace structure, failure signatures
- [ ] `cost-and-latency.md` — token budget, latency profile, cost control knobs
- [ ] `metadata.json` — pattern ID, complexity, evolution relationships, composability
- [ ] Internal cross-references added (related patterns linked with relative paths)
- [ ] Pattern added to `README.md` tables

---

## General Checklist

- [ ] All internal markdown links resolve (run CI or check manually)
- [ ] Mermaid diagrams render correctly
- [ ] No framework-specific or provider-specific language ("the LLM", not a specific model name)
- [ ] Maximum 3 heading levels used (##, ###, ####)
- [ ] No secrets or personal data included
