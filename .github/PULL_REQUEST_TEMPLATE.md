# Pull Request

## Description

<!-- Provide a clear and concise summary of the changes in this PR. Include the motivation and context. If this closes an open issue, link it here. -->

Closes #

---

## Type of Change

<!-- Check all that apply. -->

- [ ] New blueprint (adds a complete blueprint directory)
- [ ] Bug fix (non-breaking change that fixes an issue in an existing blueprint)
- [ ] Enhancement (improvement to an existing blueprint without breaking changes)
- [ ] Documentation update (README, architecture docs, website content)
- [ ] CI / tooling change (workflows, scripts, configuration)
- [ ] Pattern documentation update (docs/patterns/)
- [ ] Other (describe below)

---

## Blueprint Submission Checklist

<!-- Complete this section only when adding or significantly updating a blueprint. -->

If this PR adds or updates a blueprint, confirm the following are present and correct:

- [ ] `README.md` contains all required sections: Overview, Use Cases, Architecture, Setup, Usage, and Key Concepts.
- [ ] `architecture.md` includes a Mermaid diagram that accurately depicts the agent's control flow and component interactions.
- [ ] Python implementation is complete under `python/src/` and all `pytest` tests in `python/tests/` pass locally (`uv run pytest tests/ -v`).
- [ ] TypeScript implementation is complete under `typescript/src/` and all `vitest` tests in `typescript/tests/` pass locally (`pnpm run test`).
- [ ] `docker-compose.yml` is provided for any external service dependencies (databases, vector stores, message queues, etc.).
- [ ] The new blueprint has been added to `website/sidebars.ts` so it appears in the documentation navigation.
- [ ] Relevant pattern documentation under `docs/patterns/` has been created or updated to reflect patterns introduced by this blueprint.

---

## General Checklist

- [ ] All CI checks pass (linting, type-checking, and tests for the affected language implementations).
- [ ] Code is formatted and linting is clean (`uv run ruff check src/` and/or `pnpm run lint`).
- [ ] No secrets, API keys, or personal data are included in this PR.
- [ ] Documentation (inline comments, docstrings, and README) is accurate and up to date.
- [ ] Breaking changes (if any) are documented in the description above and a migration note has been added to `CHANGELOG.md`.

---

## Testing Notes

<!-- Describe how you tested the changes. Include any relevant commands, environment setup, or edge cases exercised. -->

```
# Example commands used to verify this PR
uv run pytest tests/ -v
pnpm run test
```

---

## Screenshots / Output (if applicable)

<!-- Paste relevant terminal output, test results, or screenshots here. -->
