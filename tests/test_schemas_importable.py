"""Smoke test: every entry's canonical Pydantic state schema imports and instantiates.

Loaded via ``importlib`` from the file path so the suite stays self-
contained whether or not the repo root is on ``sys.path``. The schemas
themselves are self-contained (no cross-entry imports), so file-path
loading is sufficient.

Cohorts are NOT hardcoded — they're read from ``taxonomy.yaml`` at the repo
root. Adding a new cohort (e.g. ``guardrails/``) means appending one entry
to taxonomy.yaml; this test picks it up automatically.

Run with:

    uv run --with 'pydantic>=2,PyYAML' pytest tests/test_schemas_importable.py
"""

from __future__ import annotations

import importlib.util
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# Taxonomy load — single source of truth for which cohorts exist.
# ---------------------------------------------------------------------------

_TAXONOMY = yaml.safe_load((REPO_ROOT / "taxonomy.yaml").read_text(encoding="utf-8"))
_COHORTS: list[dict[str, Any]] = _TAXONOMY["cohorts"]


def _eval_predicate(expr: str, entry_meta: dict[str, Any]) -> bool:
    """Tiny predicate evaluator matching the one in meta/validate-metadata.js.

    Supported forms today:
      - "true" / "false"
      - "category == 'X'" / "category != 'X'"

    Extend in lockstep with the JS evaluator when new shapes are needed.
    """
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
    import json

    path = REPO_ROOT / cohort_dir / entry_name / "metadata.json"
    if not path.is_file():
        return None
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    if not isinstance(loaded, dict):
        return None
    return loaded


def _cohort_by_dir(dir_name: str) -> dict[str, Any] | None:
    for cohort in _COHORTS:
        if cohort["dir"] == dir_name:
            return cohort
    return None


def _load(cohort: str, entry_dir: str) -> Any:
    """Import ``<cohort>/<entry_dir>/schemas/state.py`` by file path."""
    path = REPO_ROOT / cohort / entry_dir / "schemas" / "state.py"
    assert path.is_file(), f"missing schema: {path}"
    mod_name = f"_state_{cohort}_{entry_dir}"
    spec = importlib.util.spec_from_file_location(mod_name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = module
    spec.loader.exec_module(module)
    return module


# (cohort, entry_dir, primary model name, minimal valid kwargs).
# The kwargs exercise the model's required fields; auxiliary models are
# validated transitively when constructed via the primary.
_CASES: list[tuple[str, str, str, dict[str, Any]]] = [
    # Agent patterns (8)
    ("patterns", "react", "ReActState", {"question": "what?"}),
    ("patterns", "plan_and_execute", "PlanExecuteState", {"goal": "ship"}),
    ("patterns", "reflection", "ReflectionState", {"goal": "write"}),
    (
        "patterns",
        "routing",
        "RoutingState",
        {
            "request": "billing question",
            "available_routes": [{"name": "billing", "description": "money stuff"}],
        },
    ),
    ("patterns", "rag", "RagState", {"query": {"text": "what is x?"}}),
    ("patterns", "multi_agent", "MultiAgentState", {"user_goal": "ship"}),
    (
        "patterns",
        "event_driven",
        "EventDrivenState",
        {
            "current_event": {
                "event_id": "e1",
                "event_type": "x.created",
                "occurred_at": datetime(2026, 1, 1),
            },
        },
    ),
    (
        "patterns",
        "saga",
        "SagaState",
        {
            "saga_id": "s1",
            "steps": [{"id": "step-1", "name": "reserve"}],
        },
    ),
    # Primitives (3) — moved out of patterns/ in catalog v2.
    ("primitives", "tool_use", "ToolUseState", {"user_message": "hi"}),
    ("primitives", "memory", "MemoryState", {"user_id": "u1", "user_message": "hi"}),
    ("primitives", "skills", "SkillsState", {"user_message": "hi"}),
    # Modifiers (1) — moved out of patterns/ in catalog v2.
    ("modifiers", "human_in_the_loop", "HitlState", {"goal": "approve"}),
]


@pytest.mark.parametrize(
    ("cohort", "entry_dir", "model_name", "kwargs"),
    _CASES,
    ids=[f"{c[0]}/{c[1]}" for c in _CASES],
)
def test_schema_imports_and_validates(cohort: str, entry_dir: str, model_name: str, kwargs: dict[str, Any]) -> None:
    module = _load(cohort, entry_dir)
    model_cls = getattr(module, model_name, None)
    assert model_cls is not None, f"{cohort}/{entry_dir}: {model_name} not exported"
    instance = model_cls(**kwargs)
    dumped = instance.model_dump()
    assert isinstance(dumped, dict)


def test_every_entry_has_a_schemas_dir() -> None:
    """Catches the case where a new entry lands in any cohort without a schema file.

    Walks every cohort declared in taxonomy.yaml. For each entry, evaluates
    the cohort's ``requires_state_schema.when`` predicate against the entry's
    metadata; entries that require a schema must be covered by ``_CASES``
    (which the schema-import smoke test then exercises).

    Adding a brand-new cohort requires only an entry in taxonomy.yaml and
    matching contents on disk; this gate adapts automatically.
    """
    covered = {(c[0], c[1]) for c in _CASES}
    missing: list[str] = []

    for cohort in _COHORTS:
        cohort_dir = REPO_ROOT / cohort["dir"]
        if not cohort_dir.is_dir():
            continue
        predicate = cohort["requires_state_schema"]["when"]
        for p in sorted(cohort_dir.iterdir()):
            if not p.is_dir() or p.name.startswith("."):
                continue
            meta = _load_entry_metadata(cohort["dir"], p.name)
            if meta is None:
                continue
            if not _eval_predicate(predicate, meta):
                continue
            if (cohort["dir"], p.name) not in covered:
                missing.append(f"{cohort['dir']}/{p.name}")

    assert not missing, (
        f"Entries without coverage in test_schemas_importable: {missing}. "
        "Add a (cohort_dir, entry_dir, primary_model, kwargs) entry to _CASES "
        "and create <cohort_dir>/<entry_dir>/schemas/state.py + __init__.py."
    )


# Framework-agnostic sibling files that must import their canonical
# domain types from ``<cohort>/<name>/schemas/state.py`` rather than
# re-declaring them inline. Auto-discovered: any
# ``<cohort>/<entry>/code/python/<entry>.py`` (or a small set of well-known
# alternate filenames) participates.
#
# React has no top-level sibling (only framework adapter subdirs), so it's
# excluded automatically — the search looks for canonical filenames only.

# Well-known sibling filename alternatives keyed by entry id. Most siblings
# match `<entry>.py` exactly; a few (memory_agent.py, approval.py) historically
# chose a different name. New entries should use the `<entry>.py` convention
# so they're auto-discovered without adding to this table.
_SIBLING_ALT_NAMES = {
    "memory": "memory_agent.py",
    "human_in_the_loop": "approval.py",
}


def _discover_sibling_cases() -> list[tuple[str, str, str]]:
    cases: list[tuple[str, str, str]] = []
    for cohort in _COHORTS:
        cohort_dir = REPO_ROOT / cohort["dir"]
        if not cohort_dir.is_dir():
            continue
        for entry in sorted(cohort_dir.iterdir()):
            if not entry.is_dir() or entry.name.startswith("."):
                continue
            # Try the canonical filename first, then the alt-names table.
            candidate_names = [f"{entry.name}.py"]
            alt = _SIBLING_ALT_NAMES.get(entry.name)
            if alt:
                candidate_names.append(alt)
            for name in candidate_names:
                relpath = f"code/python/{name}"
                if (entry / relpath).is_file():
                    cases.append((cohort["dir"], entry.name, relpath))
                    break
    return cases


_SIBLING_CASES: list[tuple[str, str, str]] = _discover_sibling_cases()


@pytest.mark.parametrize(
    ("cohort_dir", "entry_dir", "relpath"),
    _SIBLING_CASES,
    ids=[f"{c[0]}/{c[1]}" for c in _SIBLING_CASES],
)
def test_sibling_imports_canonical_state(cohort_dir: str, entry_dir: str, relpath: str) -> None:
    """Each entry's framework-agnostic sibling imports its canonical
    state schema rather than redeclaring it inline.

    Without this gate, a rename in ``schemas/state.py`` silently desyncs
    from the sibling, and a new framework adapter can forget the import
    entirely.
    """
    src = (REPO_ROOT / cohort_dir / entry_dir / relpath).read_text(encoding="utf-8")
    needle = f"from {cohort_dir}.{entry_dir}.schemas.state import"
    assert needle in src, f"{cohort_dir}/{entry_dir}: sibling at {relpath} missing canonical import"
