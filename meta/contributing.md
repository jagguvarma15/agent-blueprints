# Contributing

We welcome contributions to agent-blueprints. This guide explains how to add new entries (patterns, primitives, modifiers — or a brand-new cohort), improve existing documentation, contribute reference implementations, and work with the website locally.

> **First-timer landing page:** [`HOW_TO_ADD_AN_ENTRY.md`](./HOW_TO_ADD_AN_ENTRY.md) is the recommended starting point. It has copy-pasteable quick-start commands, per-cohort recipes, suggested prompts for Claude Code / Cursor / Copilot, and the post-AI verification checklist.

## Types of Contributions

### Adding a new entry (pattern, primitive, modifier)

The repo's three-tier taxonomy (patterns / primitives / modifiers) is declared in [`../taxonomy.yaml`](../taxonomy.yaml). Adding a new entry to any cohort follows the same three-step flow:

1. **Open an issue first** — Use the [New Pattern Proposal](./../.github/ISSUE_TEMPLATE/blueprint-proposal.yml) template. Describe what you're adding, its use case, and how it relates to existing entries. Get alignment before writing.
2. **Mirror an exemplar.** For patterns, [`../patterns/multi_agent/`](../patterns/multi_agent/) is the canonical reference. For primitives, [`../primitives/skills/`](../primitives/skills/). For modifiers, [`../modifiers/human_in_the_loop/`](../modifiers/human_in_the_loop/). Match the structural sections in `design.md` and the tier depth.
3. **Follow the full tier structure** — Every entry needs:
   - `overview.md` (Tier 1) — architecture diagram, how it works, minimal example, tradeoffs
   - `design.md` (Tier 2) — component breakdown, data flow, error handling, scaling
   - `implementation.md` (Tier 3) — pseudocode, interfaces, testing strategy, pitfalls
   - `evolution.md` — bridge from the entry this evolves from
   - `observability.md` — key metrics, trace format, failure signatures
   - `cost-and-latency.md` — token / runtime budget, latency profile, cost control knobs
   - `metadata.json` — id, name, category, complexity, evolution and composability relationships
   - `schemas/state.py` — Pydantic state model (required for every cohort except workflow-category patterns; see [`../taxonomy.yaml`](../taxonomy.yaml) for the per-cohort rule)
4. **Include diagrams** — Every overview must have at least one Mermaid architecture diagram.
5. **Cross-reference** — Link to related entries and the choosing-a-pattern guide using relative paths.
6. **Follow the style guide** — See [style-guide.md](./style-guide.md).
7. **Regenerate the catalog + docs + website data** — After editing any `metadata.json` or tier files, run:

   ```bash
   node meta/validate-metadata.js --emit patterns-catalog.yaml
   node meta/generate-docs.js
   node meta/generate-website-data.js
   ```

   Commit the regenerated files alongside your source changes. The drift-check CI gate (`.github/workflows/catalog-drift.yml`) fails any PR whose committed artifacts don't match a fresh regen. See [`../PATTERNS_CATALOG_SCHEMA.md`](../PATTERNS_CATALOG_SCHEMA.md) for the catalog shape.

### Adding a brand-new cohort

If you think a fourth category is needed (e.g. `guardrails/`, `evaluators/`, `memory_providers/`), add one entry to [`../taxonomy.yaml`](../taxonomy.yaml)'s `cohorts:` list and create the directory. The validator, catalog emitter, schemas test, docs generator, and website data generator all read `taxonomy.yaml` — no other code change is required. See [`HOW_TO_ADD_AN_ENTRY.md#adding-a-brand-new-cohort`](./HOW_TO_ADD_AN_ENTRY.md#adding-a-brand-new-cohort).

### Improving Existing Documentation
- Fix errors, improve clarity, add missing cross-references
- Improve diagrams or add new ones where text-heavy sections could benefit
- Add missing tradeoff considerations or edge cases

### Adding a Reference Implementation
Python implementations live at `patterns/{name}/code/python/{name}.py`. To add or improve one:

1. Match the pseudocode interfaces in `implementation.md` exactly
2. Use only the Python standard library plus an LLM `Protocol` — no framework lock-in
3. Include a runnable `if __name__ == "__main__":` block with a mock LLM so the file can be tested without an API key
4. Run from repo root: `python patterns/{name}/code/python/{name}.py`

### Fixing Broken Links
- All internal cross-references use relative paths
- CI validates links on every push — run the check locally with:
  ```
  bash .github/workflows/docs.yml  # or just submit a PR and let CI catch it
  ```

## Working on the Website

The documentation website lives in `website/`. It is built with [Astro](https://astro.build) and requires Node.js 18 or later.

```bash
cd website
npm install        # install dependencies (first time only)
npm run dev        # start dev server at http://localhost:4321
npm run build      # production build + generate Pagefind search index
npm run preview    # preview the production build locally
```

**Key things to know:**
- The website reads markdown files from the repo root at build time (not from `website/`). Changes to `.md` files in `patterns/`, `workflows/`, `foundations/`, and `composition/` are picked up automatically on the next build or hot-reload.
- Interactive components (React Flow diagrams, the pattern explorer, comparison table) are in `website/src/components/`.
- Pattern metadata used by the website mirrors `metadata.json` in `website/src/data/patterns.ts` — keep both in sync when adding a new pattern.
- The search index is generated by Pagefind during `npm run build`. Run a full build before testing search.

## Good First Contributions

If this is your first contribution, these tasks are sized for one or two evenings and don't require deep familiarity with the whole repo:

- **Fix a typo or broken link.** Run `node meta/validate-metadata.js` and `npx markdownlint-cli2 "**/*.md" "#legacy/**" "#node_modules/**" "#website/**"` locally; any error message is a fixable contribution.
- **Expand a "When NOT to use" bullet.** Each pattern's overview has a short "When NOT to use" section. Adding a concrete real-world scenario you've encountered makes the section more useful.
- **Add a framework column.** [`foundations/frameworks-and-integrations.md`](../foundations/frameworks-and-integrations.md) maps patterns to frameworks. If you've worked with a framework not on the table — or notice a cell that's wrong — that's a high-value, well-scoped contribution.
- **Add a reference architecture.** [`composition/reference-architectures.md`](../composition/reference-architectures.md) collects example composed systems. A new architecture in the existing 10-section structure is a meaningful contribution that doesn't require touching the pattern docs themselves.
- **Improve an anti-composition example.** [`composition/anti-compositions.md`](../composition/anti-compositions.md) names pattern pairs that fail together. If you've seen one of these in production, adding the concrete failure mode (carefully anonymized) makes the doc real.
- **Expand a thin design doc.** Per-pattern observability or scaling sections vary in depth. [`patterns/multi_agent/design.md`](../patterns/multi_agent/design.md) is the canonical exemplar; bring another design doc closer to its structure.

These are tracked with the `good first issue` label on GitHub. If you'd like to claim one, comment on the issue first to avoid duplicate work.

## Commit message convention

We use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`. Not CI-enforced, but it keeps the git log scannable and leaves room to adopt automated release notes later. See [`../CONTRIBUTING.md#commit-message-convention`](../CONTRIBUTING.md#commit-message-convention) for the full table and the opt-in `.gitmessage` template.

## Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes following the style guide
4. Verify all links work (relative paths are correct)
5. If you changed the website, run `npm run build` in `website/` and confirm it completes without errors
6. Submit a PR using the pull request template

## Quality Checklist

Before submitting, verify:

- [ ] All internal links resolve correctly
- [ ] Mermaid diagrams render (test in a Mermaid-compatible viewer or the dev server)
- [ ] No framework-specific or provider-specific language (say "the LLM", not a specific model name)
- [ ] Maximum 3 heading levels (##, ###, ####)
- [ ] Cross-references to related patterns are included
- [ ] If adding a new pattern: all required files are present and `metadata.json` is valid (`node meta/validate-metadata.js`)
- [ ] If you edited any `metadata.json` or tier file: regenerated `patterns-catalog.yaml` (`node meta/validate-metadata.js --emit patterns-catalog.yaml`) and committed the result
