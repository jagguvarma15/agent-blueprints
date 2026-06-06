"""Repo-wide convention checks for pattern + workflow + composition code.

Migrates the per-PR manual gates from the earlier audit-paste discipline
(emoji-free, balanced braces, parseable Python) into a single test that CI
runs on every push. Three checks:

- :func:`test_no_emoji_codepoints` — scans every Python and TypeScript file
  under ``patterns/``, ``workflows/``, ``composition/`` for codepoints in
  the emoji ranges and fails if any are present. Em-dashes, arrows, and
  box-drawing characters are explicitly typography, not emoji, and pass.
- :func:`test_python_files_ast_parse` — every ``patterns/**/*.py`` parses
  cleanly via :func:`ast.parse`. Catches truncated copy-paste, mismatched
  triple-quotes, and stray tokens that a linter alone won't always surface
  before runtime.
- :func:`test_typescript_brace_balance` — every ``patterns/**/*.ts`` has
  balanced ``{}`` / ``()`` / ``[]`` totals. A weak check (it won't catch
  semantic imbalance inside string literals), but enough to flag the
  common pre-commit slips the manual audit caught.

The token-balance check is not a full TypeScript parser by design — the
``pnpm typecheck`` CI job covers that. The point here is a fast,
dependency-free guard the convention test can apply without spinning up
``tsc``.
"""

from __future__ import annotations

import ast
import pathlib

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent

# Emoji codepoint ranges. Misc symbols / dingbats (0x2600-0x27BF) plus the
# main emoji blocks (0x1F300-0x1FAFF). Em-dashes (0x2013, 0x2014), arrows
# (0x2190-0x21FF), and box-drawing (0x2500-0x257F) sit outside both ranges
# and are treated as typography, per the style guide.
_EMOJI_RANGES: list[tuple[int, int]] = [
    (0x1F300, 0x1FAFF),
    (0x2600, 0x27BF),
]

_SCAN_ROOTS = ("patterns", "workflows", "composition")


def _all_code_files() -> list[pathlib.Path]:
    out: list[pathlib.Path] = []
    for root in _SCAN_ROOTS:
        base = REPO_ROOT / root
        if not base.is_dir():
            continue
        for pattern in ("*.py", "*.ts"):
            out.extend(base.rglob(pattern))
    return sorted(p for p in out if "__pycache__" not in str(p))


def _is_emoji(codepoint: int) -> bool:
    return any(lo <= codepoint <= hi for lo, hi in _EMOJI_RANGES)


def test_no_emoji_codepoints() -> None:
    """No file under ``patterns/`` / ``workflows/`` / ``composition/``
    carries a codepoint in the emoji blocks. Catches drift before review.
    """
    fails: list[str] = []
    for path in _all_code_files():
        text = path.read_text(encoding="utf-8", errors="replace")
        for line_no, line in enumerate(text.splitlines(), start=1):
            for char in line:
                if _is_emoji(ord(char)):
                    rel = path.relative_to(REPO_ROOT)
                    fails.append(f"{rel}:{line_no}: emoji codepoint U+{ord(char):04X} ({char!r})")
                    break
            if fails and fails[-1].startswith(str(path.relative_to(REPO_ROOT))):
                break
    assert not fails, "Emoji codepoints found — replace with plain text labels:\n" + "\n".join(
        fails
    )


def test_python_files_ast_parse() -> None:
    """Every Python file under ``patterns/`` parses with ``ast.parse``.

    Cheaper than ``mypy``; catches a different failure class (truncated
    copy-paste, mismatched triple-quotes) that lints would still flag but
    only after the slower pipeline runs.
    """
    fails: list[str] = []
    base = REPO_ROOT / "patterns"
    for path in base.rglob("*.py"):
        if "__pycache__" in str(path):
            continue
        try:
            ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError as exc:
            rel = path.relative_to(REPO_ROOT)
            fails.append(f"{rel}: {exc.msg} at line {exc.lineno}")
    assert not fails, "Python files failed ast.parse:\n" + "\n".join(fails)


def test_typescript_brace_balance() -> None:
    """Every TypeScript file under ``patterns/`` has balanced bracket pairs.

    Not a parser — string literals with literal braces can fool the count.
    Picks up the realistic failure mode (trailing edit lost a closing
    bracket) without the cost of running ``tsc`` from a test.
    """
    fails: list[str] = []
    base = REPO_ROOT / "patterns"
    for path in base.rglob("*.ts"):
        text = path.read_text(encoding="utf-8", errors="replace")
        rel = path.relative_to(REPO_ROOT)
        for opener, closer in [("{", "}"), ("(", ")"), ("[", "]")]:
            if text.count(opener) != text.count(closer):
                fails.append(
                    f"{rel}: {opener}{closer} imbalance "
                    f"({text.count(opener)} vs {text.count(closer)})"
                )
    assert not fails, "TypeScript brace / paren / bracket imbalance:\n" + "\n".join(fails)
