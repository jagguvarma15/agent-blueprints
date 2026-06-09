"""Smoke test: every pattern's canonical Pydantic state schema imports and instantiates.

Loaded via ``importlib`` from the file path so the suite stays self-
contained whether or not the repo root is on ``sys.path``. The schemas
themselves are self-contained (no cross-pattern imports), so file-path
loading is sufficient.

Run with:

    uv run --with 'pydantic>=2' pytest tests/test_schemas_importable.py
"""

from __future__ import annotations

import importlib.util
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent

# Three-tier taxonomy: patterns/, primitives/, modifiers/. Each cohort holds
# entries with the same on-disk shape (schemas/state.py + __init__.py), so
# the importable-schema check walks all three under a common loader.
COHORT_DIRS: tuple[str, ...] = ("patterns", "primitives", "modifiers")


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

    Walks all three cohort directories (patterns/, primitives/, modifiers/)
    and asserts each non-hidden subdirectory is covered by a _CASES entry.
    Workflow-category patterns (code-controlled flow shapes — prompt-chaining,
    parallel-calls, orchestrator-worker, evaluator-optimizer) are exempted —
    they ship overview/design/implementation tier files but historically have
    not carried a Pydantic state model.
    """
    import json

    covered = {(c[0], c[1]) for c in _CASES}
    missing: list[str] = []
    for cohort in COHORT_DIRS:
        cohort_dir = REPO_ROOT / cohort
        if not cohort_dir.is_dir():
            continue
        for p in sorted(cohort_dir.iterdir()):
            if not p.is_dir() or p.name.startswith("."):
                continue
            # Read category to exempt workflows.
            meta_path = p / "metadata.json"
            if meta_path.is_file():
                try:
                    if json.loads(meta_path.read_text())["category"] == "workflow":
                        continue
                except (KeyError, json.JSONDecodeError):
                    pass
            if (cohort, p.name) not in covered:
                missing.append(f"{cohort}/{p.name}")
    assert not missing, (
        f"Entries without coverage in test_schemas_importable: {missing}. "
        "Add a (cohort, entry_dir, primary_model, kwargs) entry to _CASES "
        "and create <cohort>/<entry_dir>/schemas/state.py + __init__.py."
    )


# Framework-agnostic sibling files that must import their canonical
# domain types from ``<cohort>/<name>/schemas/state.py`` rather than
# re-declaring them inline. React has no top-level sibling (only framework
# adapter subdirs), so the canonical-import gate applies through the
# adapter-level coverage below.
_SIBLING_CASES: list[tuple[str, str, str]] = [
    ("patterns", "event_driven", "code/python/event_driven.py"),
    ("patterns", "multi_agent", "code/python/multi_agent.py"),
    ("patterns", "plan_and_execute", "code/python/plan_and_execute.py"),
    ("patterns", "rag", "code/python/rag.py"),
    ("patterns", "reflection", "code/python/reflection.py"),
    ("patterns", "routing", "code/python/routing.py"),
    ("patterns", "saga", "code/python/saga.py"),
    ("primitives", "memory", "code/python/memory_agent.py"),
    ("primitives", "tool_use", "code/python/tool_use.py"),
    ("modifiers", "human_in_the_loop", "code/python/approval.py"),
]


@pytest.mark.parametrize(
    ("cohort", "entry_dir", "relpath"),
    _SIBLING_CASES,
    ids=[f"{c[0]}/{c[1]}" for c in _SIBLING_CASES],
)
def test_sibling_imports_canonical_state(cohort: str, entry_dir: str, relpath: str) -> None:
    """Each entry's framework-agnostic sibling imports its canonical
    state schema rather than redeclaring it inline.

    Without this gate, a rename in ``schemas/state.py`` silently desyncs
    from the sibling, and a new framework adapter can forget the import
    entirely.
    """
    src = (REPO_ROOT / cohort / entry_dir / relpath).read_text(encoding="utf-8")
    needle = f"from {cohort}.{entry_dir}.schemas.state import"
    assert needle in src, f"{cohort}/{entry_dir}: sibling at {relpath} missing canonical import"
