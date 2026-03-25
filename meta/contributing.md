# Contributing

We welcome contributions to agent-blueprints. This guide explains how to add new patterns, improve existing documentation, and work with the repository.

## Types of Contributions

### Adding a New Pattern
If you want to document a new workflow or agent pattern:

1. **Open an issue first** — Describe the pattern, its use cases, and how it relates to existing patterns. Get alignment before writing.
2. **Follow the 3-tier structure** — Every pattern needs `overview.md` (Tier 1), `design.md` (Tier 2), and `implementation.md` (Tier 3). Agent patterns also need `evolution.md`.
3. **Include diagrams** — Every overview must have at least one Mermaid architecture diagram.
4. **Cross-reference** — Link to related patterns, workflows, and the choosing-a-pattern guide.
5. **Follow the style guide** — See [style-guide.md](./style-guide.md).

### Improving Existing Documentation
- Fix errors, improve clarity, add missing cross-references
- Improve diagrams or add new ones where text-heavy sections could benefit
- Add missing tradeoff considerations or edge cases

### Fixing Broken Links
- All internal cross-references use relative paths
- Run link validation before submitting

## Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes following the style guide
4. Verify all links work (relative paths are correct)
5. Submit a PR with a clear description of what changed and why

## Quality Checklist

Before submitting, verify:

- [ ] All internal links resolve correctly
- [ ] Mermaid diagrams render (test in a Mermaid-compatible viewer)
- [ ] No code files outside `legacy/` (Phase 1 is docs-only)
- [ ] No framework-specific or provider-specific language (say "the LLM" not a specific model)
- [ ] Maximum 3 heading levels (##, ###, ####)
- [ ] Cross-references to related patterns are included
