# Contributing to agent-blueprints

Thank you for your interest in contributing. This guide covers everything you need to know — from proposing a brand-new blueprint to fixing a typo in an existing one.

---

## Table of contents

1. [Code of Conduct](#code-of-conduct)
2. [Ways to contribute](#ways-to-contribute)
3. [Proposing a new blueprint](#proposing-a-new-blueprint)
4. [Development setup](#development-setup)
5. [Blueprint requirements checklist](#blueprint-requirements-checklist)
6. [Code standards](#code-standards)
7. [Submitting a pull request](#submitting-a-pull-request)
8. [Running tests locally](#running-tests-locally)
9. [Getting help](#getting-help)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). All contributors are expected to uphold it. Unacceptable behaviour should be reported to the maintainers via the email address listed in the Code of Conduct.

---

## Ways to contribute

| Contribution type | Where to start |
|-------------------|---------------|
| Bug report | [Open a Bug Report issue](https://github.com/jvarma/agent-blueprints/issues/new/choose) |
| Documentation improvement | Edit the relevant `README.md` or `architecture.md` and open a PR |
| Fix in an existing blueprint | Fork, fix, and open a PR against `main` |
| New blueprint | Read [Proposing a new blueprint](#proposing-a-new-blueprint) first |
| CLI / tooling improvement | See `packages/cli/` and open a PR |
| Question / idea | Start a [GitHub Discussion](https://github.com/jvarma/agent-blueprints/discussions) |

---

## Proposing a new blueprint

Before writing any code for a new blueprint, **please open an issue** using the [New Blueprint issue template](https://github.com/jvarma/agent-blueprints/issues/new?template=new-blueprint.yml). The template will prompt you for:

- **Blueprint name and number** (check existing blueprints and claim the next available slot).
- **Pattern category** — one of: Orchestration, Multi-agent, Memory, RAG, Tools, Control flow.
- **Complexity** — Beginner, Intermediate, or Advanced (see the README for definitions).
- **Problem statement** — What real-world problem does this blueprint solve that is not already covered?
- **Proposed architecture** — A rough Mermaid diagram or ASCII sketch is fine at this stage.
- **External dependencies** — List any services, APIs, or paid resources the blueprint requires.

A maintainer will review the proposal within 7 days and either approve it, request changes, or explain why it does not fit the current scope. Approval on the issue is required before opening a draft PR for a new blueprint.

---

## Development setup

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Git | Any recent | — |
| Node.js | 20+ | Use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) |
| pnpm | 9+ | `npm install -g pnpm` |
| Python | 3.11+ | Use [pyenv](https://github.com/pyenv/pyenv) |
| uv | Latest | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Docker + Compose | Any recent | Required only for integration tests |

### Fork and clone

```bash
# 1. Fork the repo on GitHub, then:
git clone https://github.com/<your-username>/agent-blueprints.git
cd agent-blueprints

# 2. Add the upstream remote
git remote add upstream https://github.com/jvarma/agent-blueprints.git
```

### Install CLI tooling (TypeScript workspace)

```bash
pnpm install          # installs all workspace packages from the repo root
pnpm build            # compiles the CLI and any shared packages
```

### Set up a blueprint for development

#### Python

```bash
cd blueprints/<blueprint-folder>/python
uv sync               # creates .venv and installs all dependencies
cp .env.example .env  # fill in any required API keys
```

#### TypeScript

```bash
cd blueprints/<blueprint-folder>/typescript
pnpm install
cp .env.example .env
```

### Environment variables

Each blueprint ships with a `.env.example` file. Copy it to `.env` and fill in the values. **Never commit `.env` files.** They are globally git-ignored.

API keys for CI are injected as GitHub Actions secrets and are not required to run unit tests locally — unit tests use stubs/mocks that avoid live API calls.

---

## Blueprint requirements checklist

Every blueprint (new or substantially updated) **must** satisfy all items in this checklist before it can be merged. Reviewers will use this list when evaluating your PR.

### Directory layout

```
blueprints/<NN>-<slug>/
├── README.md
├── architecture.md
├── python/
│   ├── agent.py           (or equivalent entrypoint)
│   ├── pyproject.toml
│   ├── .env.example
│   └── tests/
│       └── test_agent.py
├── typescript/
│   ├── src/
│   │   └── agent.ts       (or equivalent entrypoint)
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── tests/
│       └── agent.test.ts
└── docker-compose.yml
```

### Required files

- [ ] **`README.md`** (blueprint-level) must include:
  - A one-paragraph description of the pattern.
  - "When to use this pattern" section with at least three bullet points.
  - "When NOT to use this pattern" section.
  - Step-by-step quickstart for both Python and TypeScript.
  - "Key concepts" section explaining the core ideas.
  - "Extending this blueprint" section with suggestions for next steps.
  - Links to relevant papers or prior art.

- [ ] **`architecture.md`** must include:
  - At least one Mermaid diagram (flowchart or sequence diagram) depicting the full agent loop.
  - A written explanation of every node / actor in the diagram.
  - Discussion of failure modes and how the blueprint handles them.
  - Complexity and latency trade-off notes.

- [ ] **Python implementation** must include:
  - A working `agent.py` (or equivalent) that runs end-to-end.
  - `pyproject.toml` with all dependencies pinned (via `uv lock`).
  - `.env.example` listing every required environment variable with a description.
  - At least one unit test file under `tests/` using `pytest`.
  - Tests must pass without network access (use `pytest-httpx`, `respx`, or equivalent stubs).

- [ ] **TypeScript implementation** must include:
  - A working `src/agent.ts` (or equivalent) that runs end-to-end.
  - `package.json` with all dependencies pinned.
  - `tsconfig.json` set to `strict: true`.
  - `.env.example` listing every required environment variable with a description.
  - At least one test file under `tests/` using `vitest`.
  - Tests must pass without network access (use `vi.mock` or `msw`).

- [ ] **`docker-compose.yml`** must:
  - Define an `agent` service that runs the Python implementation by default.
  - Include any required backing services (e.g. Qdrant for RAG blueprints, Redis for memory blueprints).
  - Expose a clear health-check so `docker compose up --wait` works reliably.
  - Not require pre-built images that are not publicly available.

---

## Code standards

Consistency across the repo is important. All contributions must follow these standards. The CI pipeline enforces them automatically.

### Python

| Tool | Purpose | Config file |
|------|---------|-------------|
| [ruff](https://docs.astral.sh/ruff/) | Linting + formatting | `pyproject.toml` (`[tool.ruff]`) |
| [mypy](https://mypy.readthedocs.io/) | Static type checking | `pyproject.toml` (`[tool.mypy]`) |
| [pytest](https://docs.pytest.org/) | Testing | `pyproject.toml` (`[tool.pytest.ini_options]`) |

Run all Python checks for a blueprint:

```bash
cd blueprints/<NN>-<slug>/python
uv run ruff check .
uv run ruff format --check .
uv run mypy .
uv run pytest
```

Key rules:
- All public functions and classes must have type annotations.
- Maximum line length: **88** characters (ruff default).
- All imports must be at the top of the file; no inline imports except inside `TYPE_CHECKING` blocks.
- No `# type: ignore` comments without an accompanying explanation comment.
- Prefer `pathlib.Path` over `os.path`.

### TypeScript

| Tool | Purpose | Config file |
|------|---------|-------------|
| [ESLint](https://eslint.org/) | Linting | `eslint.config.mjs` |
| [Prettier](https://prettier.io/) | Formatting | `.prettierrc` |
| [vitest](https://vitest.dev/) | Testing | `vitest.config.ts` |

Run all TypeScript checks for a blueprint:

```bash
cd blueprints/<NN>-<slug>/typescript
pnpm lint
pnpm format:check
pnpm test
```

Key rules:
- `tsconfig.json` must have `"strict": true` and `"noUncheckedIndexedAccess": true`.
- No `any` types without an explicit `// eslint-disable-next-line` comment and justification.
- Use `const` by default; only use `let` when reassignment is necessary.
- All async functions must have explicit return type annotations.
- Prefer named exports over default exports.

### General

- Keep dependencies minimal. Before adding a new dependency, ask: "Does this blueprint genuinely need this, or can it be done with the standard library?"
- Environment configuration must be read from environment variables only, never hardcoded.
- Secrets (API keys, passwords) must never appear in committed code or test fixtures — use placeholder strings like `sk-test-placeholder`.
- All user-visible strings in tests should use realistic but clearly fake data (e.g. `example.com` domains, lorem ipsum content).

---

## Submitting a pull request

### Branch naming

Use the following convention:

```
<type>/<short-description>
```

| Type | Use when |
|------|---------|
| `blueprint/<NN>-<slug>` | Adding a brand-new blueprint |
| `fix/<NN>-<slug>-<issue>` | Fixing a bug in an existing blueprint |
| `docs/<topic>` | Documentation-only changes |
| `chore/<topic>` | Tooling, CI, or dependency updates |
| `feat/cli-<feature>` | New CLI functionality |

Examples:
```
blueprint/11-long-horizon
fix/04-multi-agent-supervisor-deadlock
docs/contributing-setup
chore/update-ruff-0.4
```

### Commit style

This project follows the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

```
<type>(<scope>): <short summary in present tense>

[optional body — wrap at 72 characters]

[optional footer — e.g. Closes #123]
```

Common types: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `perf`.

Examples:

```
feat(blueprint-04): add supervisor failover on agent timeout

fix(blueprint-07): correct embedding dimension mismatch with ada-002

docs(contributing): add uv setup instructions for Windows

chore(ci): pin actions/checkout to v4.1.2
```

Commits that do not follow this format will cause CI to fail (enforced by [commitlint](https://commitlint.js.org/)).

### PR checklist

Before marking your PR as "Ready for Review", confirm every item below:

- [ ] The branch is up to date with `upstream/main` (`git fetch upstream && git rebase upstream/main`).
- [ ] All CI checks pass (lint, type-check, tests).
- [ ] The blueprint requirements checklist is fully satisfied (for new blueprints).
- [ ] `architecture.md` has been created or updated to reflect any structural changes.
- [ ] No secrets, API keys, or personal data appear anywhere in the diff.
- [ ] `.env.example` is present and lists every environment variable used.
- [ ] All new dependencies are justified in the PR description.
- [ ] The PR description explains **what** changed and **why** (not just how).
- [ ] Relevant issues are linked in the PR description (`Closes #<number>`).

### Review process

1. A maintainer will review your PR within 7 days of it being marked "Ready for Review".
2. Reviewers may request changes. Address each comment, either by making the change or explaining why you believe the current approach is correct.
3. Once all reviewers have approved and CI is green, a maintainer will merge using **squash merge** to keep the commit history clean.
4. Draft PRs are welcome and encouraged for early feedback — just make sure to remove the draft status when you are ready for a full review.

---

## Running tests locally

### Run all tests in a single blueprint

```bash
# Python
cd blueprints/01-react-agent/python
uv run pytest -v

# TypeScript
cd blueprints/01-react-agent/typescript
pnpm test
```

### Run tests across all blueprints at once

From the repo root:

```bash
# Python — runs pytest in every blueprint that has a pyproject.toml
pnpm run test:python

# TypeScript — runs vitest in every blueprint typescript directory
pnpm run test:typescript

# Both
pnpm test
```

### Run integration tests (requires Docker)

Integration tests spin up real backing services via Docker Compose. They are skipped by default to avoid requiring Docker in every environment.

```bash
cd blueprints/07-rag-basic
docker compose up -d          # start backing services (Qdrant, etc.)

# Python
cd python
INTEGRATION=1 uv run pytest -v -m integration

# TypeScript
cd ../typescript
INTEGRATION=1 pnpm test

# Tear down
cd ..
docker compose down -v
```

### Linting and type-checking all code

```bash
# From the repo root — runs linters for every blueprint
pnpm run lint
```

---

## Getting help

- **Questions about a blueprint's design** — open a [GitHub Discussion](https://github.com/jvarma/agent-blueprints/discussions) in the "Blueprint Design" category.
- **Bug reports** — open a [GitHub Issue](https://github.com/jvarma/agent-blueprints/issues/new/choose).
- **Security vulnerabilities** — do not open a public issue. Email the maintainers directly (see `SECURITY.md`).
- **General chat** — join the `#agent-blueprints` channel in the community Discord (link in the GitHub repo description).

We appreciate every contribution, no matter how small. Thank you for helping make `agent-blueprints` the best reference it can be.
