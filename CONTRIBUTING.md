# Contributing

Thanks for adding to this repo.

## TL;DR — adding a pattern, primitive, or modifier

Three steps:

1. **Pick a cohort.** Patterns, primitives, modifiers (or [a new cohort entirely](meta/HOW_TO_ADD_AN_ENTRY.md#adding-a-brand-new-cohort)).
2. **Create the entry directory** with `metadata.json` + the tier markdown files it declares.
3. **Run the generators:**
   ```bash
   node meta/validate-metadata.js --emit patterns-catalog.yaml
   node meta/generate-docs.js
   node meta/generate-website-data.js
   ```
   …then commit metadata + tier files + the regenerated `patterns-catalog.yaml`, `website/src/data/patterns.ts`, and any docs the generators touched.

**The full walkthrough** — including per-cohort examples, prompts for AI tools (Claude Code / Cursor / Copilot), and the post-AI verification checklist — lives in [`meta/HOW_TO_ADD_AN_ENTRY.md`](meta/HOW_TO_ADD_AN_ENTRY.md).

For the style conventions per tier file, see [`meta/style-guide.md`](meta/style-guide.md). For the per-cohort doc set, see [`patterns/README.md`](patterns/README.md), [`primitives/README.md`](primitives/README.md), and [`modifiers/README.md`](modifiers/README.md).

## How to run the gate locally

CI runs ruff + mypy + pytest + tsc on every PR. To run the same checks before pushing:

```bash
# Python — lint, format check, type check, tests
uv run --with 'ruff>=0.6' ruff check .
uv run --with 'ruff>=0.6' ruff format --check .
uv run --with 'mypy>=1.10' --with 'pydantic>=2' --with pytest mypy --config-file pyproject.toml tests/
uv run --with 'pydantic>=2' --with pytest pytest tests/

# TypeScript — typecheck
pnpm install
pnpm typecheck
```

The Python gate uses `uv run --with ...` so contributors don't have to install the toolchain at the project level; the same shape runs in CI.

## Style

- No emojis in code, comments, or docstrings. Plain-text labels (`ok` / `warn` / `fail`) instead of `✓ / ⚠ / ✗`. Em-dashes, arrows, and box-drawing characters are typography, not emoji, and are fine. The convention test catches drift automatically — see `tests/test_code_conventions.py`.
- Pattern code files open with a 5-7 line docstring naming the pattern, framework, idioms used, line of sight to the design doc, and install/run instructions. See `meta/style-guide.md` for the full body shape.
- Schema imports are mandatory. Every framework-agnostic sibling and framework adapter under `patterns/<name>/code/python/` must import its domain types from `patterns.<name>.schemas.state`. Inline redeclaration of a canonical type is a style-guide violation; the import test in `tests/test_schemas_importable.py` gates the contract.

## What CI runs

- `ruff check` — lint (rules: E, F, I, UP, B; see `pyproject.toml`).
- `ruff format --check` — formatter conformance.
- `mypy tests/` — strict mode on the test harness. Demo snippets under `patterns/` / `workflows/` / `composition/` have mypy intentionally relaxed (they're illustrative, not library code).
- `pytest tests/` — schema-import gate, convention checks, two B5 overlay walkthroughs.
- `pnpm typecheck` — TypeScript `tsc --noEmit` across `patterns/**/*.ts`, `workflows/**/*.ts`, `composition/**/*.ts`.

If a check fails, fix the cause rather than silencing the rule. The two existing per-file exemptions (`patterns/tool_use/code/python/tool_use.py` ignores `S307` for its documented `eval()` demo; the convention test ignores `E501` because it carries long path strings) are the only allowlist entries. New exemptions need an inline justification.
