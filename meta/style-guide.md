# Style Guide

Rules for writing documentation in this repository. Consistency matters — every document should feel like it was written by the same team.

> **Exemplar:** [`patterns/multi_agent/`](../patterns/multi_agent/) is the canonical reference. When in doubt about structure, depth, or section choice, match it.

## Voice and Tone

- **Technical but approachable.** Write as if explaining to a smart engineer who hasn't built agents before.
- **Be direct.** Lead with what something does, then explain how and why.
- **Be opinionated.** State when a pattern is a bad fit. State when one pattern is better than another.
- **No marketing language.** No "revolutionary", "cutting-edge", "powerful", "seamless". Describe what things do.
- **Use active voice.** "The orchestrator decomposes the task" not "The task is decomposed by the orchestrator."

## Structure

### Headings
- Maximum 3 levels: `##`, `###`, `####`
- Headings are sentence case: "Error handling strategy" not "Error Handling Strategy"
- Don't skip levels (no `####` directly under `##`)

### Document Organization
- Lead with the most important information
- Use tables for comparisons (tradeoffs, pattern comparisons, decision matrices)
- Use diagrams over walls of text — if something can be shown visually, show it
- Keep paragraphs short (3–5 sentences maximum)

## Diagrams

### Mermaid Rules
- Use `graph TD` (top-down) for sequential flows
- Use `graph LR` (left-right) for parallel or branching flows
- Label every edge with what data flows along it
- Use consistent node shapes:
  - `[rectangles]` for processes
  - `{diamonds}` for decisions
  - `[(cylinders)]` for storage
  - `([rounded])` for start/end points
  - `[/"parallelogram"/]` for constraints/guards
- Keep diagrams under 20 nodes — split into sub-diagrams if larger
- Every diagram must have a caption (italic text below) explaining what it shows

### Color Conventions
Use these fill colors consistently for component diagrams:
- `#e3f2fd` — Input/output (blue)
- `#fff3e0` — LLM processing (orange)
- `#e8f5e9` — Execution/tools (green)
- `#fce4ec` — Decisions (pink)
- `#f3e5f5` — State/memory (purple)
- `#fff8e1` — Orchestration/control (yellow)
- `#ffcdd2` — Error/failure (red)

For **complexity-gradient diagrams** (e.g., the decision flowchart in `foundations/choosing-a-pattern.md` and pattern indexes), use a green-saturation scale from light to dark to indicate increasing complexity:
- `#c8e6c9` — least complex
- `#a5d6a7`
- `#81c784`
- `#66bb6a`
- `#4caf50` — most complex

These gradient colors are reserved for that purpose and should not be mixed into component diagrams.

## Cross-References

- **Link constantly.** Every mention of another pattern should be a link.
- Use relative paths: `../../workflows/prompt-chaining/overview.md`
- Link to the specific tier that's appropriate:
  - Casual mention → `overview.md`
  - Design discussion → `design.md`
  - Implementation detail → `implementation.md`

## Terminology

- Use terms as defined in [terminology.md](../foundations/terminology.md)
- "The LLM" — never a specific model name or provider
- "A vector store" — never a specific product
- "An embedding model" — never a specific service
- "Tool" not "function" when referring to LLM tool use
- "Pattern" not "blueprint" (blueprint is the old terminology)

## Sub-Section Labels

When a section has short, parallel sub-blocks that don't merit their own `###` heading (e.g., a list of test categories, a few labeled paragraphs in a decision discussion), use a bold inline label on its own line:

```markdown
**What to test:**

- Item one
- Item two

**How to test it:**

- Item one
- Item two
```

This is preferred over a `####` heading when:
- The block is short (1–5 lines)
- The label introduces parallel content (typically a list or single paragraph)
- The label wouldn't make sense in the table of contents

Don't use bold labels as a substitute for real headings when the content is a full sub-section. Markdownlint's `MD036` is intentionally not enforced in this repo for this reason.

## Pseudocode (Tier 3 only)

- Language-agnostic — should read like well-commented English
- Use descriptive names: `execute_step` not `exec_s`
- Include comments explaining "why" for non-obvious logic
- Format as indented blocks with clear structure
- No real language syntax (no Python's `def`, no TypeScript's `const`)

## Code layout

Per-pattern code lives under `patterns/<name>/code/` in a three-tier structure:

```
patterns/<name>/
  code/
    _reference.py                  # framework-agnostic MockLLM reference
    python/
      pydantic-ai/<name>.py        # real Pydantic AI implementation
      langgraph/<name>.py          # real LangGraph implementation
      crewai/<name>.py             # only where idiomatic
    typescript/
      vercel-ai-sdk/<name>.ts      # real Vercel AI SDK implementation
      mastra/<name>.ts             # only where idiomatic
```

Rules:

- **`_reference.py` is the canonical control-flow doc.** It uses a `MockLLM` so the design docs (`design.md`, `implementation.md`) can read against it without depending on any framework. Keep it small and simple; don't optimize.
- **Per-framework files run end-to-end against the real framework.** Pin imports to the versions in `agent-deployments/docs/frameworks/<framework>.md` frontmatter. Each file ships an `if __name__ == "__main__":` (Python) or top-level `import.meta.url` guard (TypeScript) that exercises the loop with a stubbed-or-real model.
- **Skip a (language × framework) variant when it's not idiomatic.** CrewAI for ReAct, Mastra for RAG — not every cell in the matrix earns a file. Document the skip in the pattern's `overview.md` variants table.
- **TypeScript files use ESM** (`"type": "module"` in `package.json`); the file header includes a 1-line `tsconfig` snippet showing the minimum config.
- **Every file opens with a 5–7 line docstring**: pattern name, framework, idioms used, line-of-sight to the design doc, install + run instructions.

The variants are linked from each pattern's `overview.md` in a small Implementation table so readers pick the file that matches their stack.

## Typed prompts

Every LLM call inside a pattern has a canonical prompt file at `patterns/<name>/prompts/<role>.md`. The frontmatter declares the prompt's I/O contract so downstream tooling (validators, recipe generators) can reason about it without parsing the prose body.

Frontmatter schema:

```yaml
---
role: planner                       # the role this prompt serves (matches the pattern's design vocabulary)
pattern: plan-and-execute           # the pattern slug
inputs:
  - {name: goal, type: string, description: "..."}
  - {name: context, type: ["string", "null"], description: "..."}
output_schema:                      # JSON Schema (Draft 2020-12) for the model's response
  type: object
  required: [steps]
  properties:
    steps: {type: array, ...}
model_hint: sonnet                  # haiku | sonnet | opus (no full model ids — they rotate)
estimated_tokens: 800               # optional; used by cost-estimation tooling
---
```

Field semantics:

- **`role`** matches the pattern's design vocabulary (e.g. `planner`, `critic`, `decider`). Lock these names — recipes reference them.
- **`pattern`** is the directory slug under `patterns/`.
- **`inputs`** is a list of `{name, type, description}`. Type can be a single JSON-Schema type or a list (`["string", "null"]`) for nullable.
- **`output_schema`** is valid JSON Schema (Draft 2020-12). Runtime code can validate the model's response against it.
- **`model_hint`** is one of `haiku | sonnet | opus`. Don't put full model ids here — they rotate; the scaffold maps the hint to the current model.
- **`estimated_tokens`** is optional output-budget guidance.

Body of the prompt file:

- **`## Prompt template`** — the actual prompt text in a fenced block. Use `{{var_name}}` for interpolation; names must match the `inputs` frontmatter.
- **`## Notes`** — when to use this prompt, why the schema looks the way it does, common failure modes, eval recommendations.

When multiple roles share a prompt file (rare — usually one per file), name them `<role>.md`. When a pattern needs per-instance variants of a role (e.g., per-route specialists), name them `<role>-<variant>.md` and document the variant in `Notes`.
