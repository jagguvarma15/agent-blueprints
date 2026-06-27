"""Smoke runs of every pattern's framework-agnostic Python sibling.

Each sibling under ``patterns/<id>/code/python/<id>.py`` (and the matching
primitives/modifiers files) ships a ``MockLLM`` and an ``if __name__ ==
"__main__":`` block that exercises the canonical entry point. This test
auto-discovers those files and runs each as a subprocess, asserting:

  1. Process exits with code 0 — no exceptions during the demo run.
  2. Demo emits non-empty stdout — the run actually produced output.
  3. Schema-bearing entries import their canonical state schema (covered
     transitively by the existing ``test_sibling_imports_canonical_state``
     gate in ``test_schemas_importable.py``).

Cohorts are NOT hardcoded — they come from ``taxonomy.yaml`` and the
filesystem layout each cohort declares. Adding a new entry that ships a
sibling automatically participates here.

Run with:

    uv run --with 'pydantic>=2,PyYAML' pytest tests/test_pattern_code_runtime.py

A few framework-agnostic siblings carry alternate filenames
(``memory_agent.py``, ``approval.py``) — the same alt-names map used by
``test_schemas_importable.py`` is mirrored here so discovery stays in
lockstep.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent

# Taxonomy load — single source of truth for which cohorts exist.
_TAXONOMY = yaml.safe_load((REPO_ROOT / "taxonomy.yaml").read_text(encoding="utf-8"))
_COHORTS: list[dict[str, Any]] = _TAXONOMY["cohorts"]


# Well-known sibling filename alternatives keyed by entry id. Kept in
# lockstep with ``tests/test_schemas_importable.py``. New entries should use
# the ``<entry>.py`` convention so they're auto-discovered without an entry
# in this table.
_SIBLING_ALT_NAMES = {
    "memory": "memory_agent.py",
    "human_in_the_loop": "approval.py",
}

# Workflow-category patterns whose siblings don't import a canonical state
# schema (the v2 taxonomy doesn't require one for ``category == 'workflow'``).
# These run as plain subprocesses; we don't need to grant PYTHONPATH access
# to the repo root, but doing so uniformly keeps the harness simple.
_WORKFLOW_SIBLINGS: set[str] = set()


def _eval_predicate(expr: str, entry_meta: dict[str, Any]) -> bool:
    """Mirror of ``test_schemas_importable._eval_predicate``."""
    import re

    trimmed = (expr or "").strip()
    if trimmed == "true":
        return True
    if trimmed == "false":
        return False
    match = re.match(r"^category\s*(==|!=)\s*'([a-zA-Z][a-zA-Z0-9_-]*)'$", trimmed)
    if match:
        op, value = match.group(1), match.group(2)
        cat = entry_meta.get("category")
        return cat == value if op == "==" else cat != value
    raise ValueError(f"unsupported expression: {expr}")


def _load_entry_metadata(cohort_dir: str, entry_name: str) -> dict[str, Any] | None:
    """Entry metadata from overview.md frontmatter, falling back to metadata.json.

    Mirrors ``test_schemas_importable._load_entry_metadata`` — kept in lockstep.
    """
    import json
    import re

    entry = REPO_ROOT / cohort_dir / entry_name
    overview = entry / "overview.md"
    if overview.is_file():
        match = re.match(
            r"^---\r?\n(.*?)\r?\n---\s*(?:\r?\n|$)",
            overview.read_text(encoding="utf-8"),
            re.DOTALL,
        )
        if match:
            fm = yaml.safe_load(match.group(1))
            if isinstance(fm, dict):
                return fm
    path = entry / "metadata.json"
    if not path.is_file():
        return None
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    return loaded if isinstance(loaded, dict) else None


def _discover_siblings() -> list[tuple[str, str, Path]]:
    """Walk every cohort and find the framework-agnostic sibling file.

    Returns tuples of ``(cohort_dir, entry_id, sibling_path)``.
    """
    out: list[tuple[str, str, Path]] = []
    for cohort in _COHORTS:
        cohort_dir = REPO_ROOT / cohort["dir"]
        if not cohort_dir.is_dir():
            continue
        for entry in sorted(cohort_dir.iterdir()):
            if not entry.is_dir() or entry.name.startswith("."):
                continue
            meta = _load_entry_metadata(cohort["dir"], entry.name)
            if meta is None:
                continue
            candidates = [f"{entry.name}.py"]
            alt = _SIBLING_ALT_NAMES.get(entry.name)
            if alt:
                candidates.append(alt)
            for candidate in candidates:
                rel = entry / "code" / "python" / candidate
                if rel.is_file():
                    out.append((cohort["dir"], entry.name, rel))
                    if meta.get("category") == "workflow":
                        _WORKFLOW_SIBLINGS.add(entry.name)
                    break
    return out


_CASES = _discover_siblings()


@pytest.mark.parametrize(
    ("cohort_dir", "entry_id", "sibling_path"),
    _CASES,
    ids=[f"{c[0]}/{c[1]}" for c in _CASES],
)
def test_sibling_runtime_smoke(cohort_dir: str, entry_id: str, sibling_path: Path) -> None:
    """Run the framework-agnostic sibling's demo block via subprocess.

    The sibling's ``if __name__ == "__main__":`` block uses an in-process
    ``MockLLM`` (no network), so this exercises the real loop without any
    provider credentials.
    """
    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO_ROOT) + os.pathsep + env.get("PYTHONPATH", "")
    env.setdefault("PYTHONIOENCODING", "utf-8")
    result = subprocess.run(
        [sys.executable, str(sibling_path)],
        capture_output=True,
        text=True,
        env=env,
        cwd=str(REPO_ROOT),
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, (
        f"{cohort_dir}/{entry_id} sibling exited {result.returncode}\n"
        f"stdout:\n{result.stdout}\n"
        f"stderr:\n{result.stderr}"
    )
    assert result.stdout.strip(), (
        f"{cohort_dir}/{entry_id} sibling produced no stdout — the demo "
        "block should print something so a downstream eye can confirm the "
        "loop ran end to end."
    )


def test_at_least_one_sibling_discovered() -> None:
    """Sanity gate — discovery wiring must produce at least one case.

    Siblings are optional per entry (some entries ship only framework
    adapters under ``code/python/<framework>/`` plus schemas, with no
    top-level ``<entry>.py``). What we want to catch is a refactor that
    accidentally breaks the discovery walk so every parametrized smoke
    silently drops out.
    """
    assert _CASES, (
        "no canonical siblings discovered — discovery walk is likely broken; "
        "check the per-cohort `code/python/<entry>.py` convention"
    )
