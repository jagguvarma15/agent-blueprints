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
PATTERNS_DIR = REPO_ROOT / "patterns"


def _load(pattern_dir: str) -> Any:
    """Import ``patterns/<pattern_dir>/schemas/state.py`` by file path."""
    path = PATTERNS_DIR / pattern_dir / "schemas" / "state.py"
    assert path.is_file(), f"missing schema: {path}"
    mod_name = f"_pattern_schema_{pattern_dir}"
    spec = importlib.util.spec_from_file_location(mod_name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = module
    spec.loader.exec_module(module)
    return module


# Pattern dir → (primary model name, minimal valid kwargs). The kwargs
# exercise the model's required fields; auxiliary models are validated
# transitively when constructed via the primary.
_CASES: list[tuple[str, str, dict[str, Any]]] = [
    ("react", "ReActState", {"question": "what?"}),
    ("tool_use", "ToolUseState", {"user_message": "hi"}),
    ("plan_and_execute", "PlanExecuteState", {"goal": "ship"}),
    ("reflection", "ReflectionState", {"goal": "write"}),
    (
        "routing",
        "RoutingState",
        {
            "request": "billing question",
            "available_routes": [{"name": "billing", "description": "money stuff"}],
        },
    ),
    ("rag", "RagState", {"query": {"text": "what is x?"}}),
    ("memory", "MemoryState", {"user_id": "u1", "user_message": "hi"}),
    ("multi_agent", "MultiAgentState", {"user_goal": "ship"}),
    (
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
        "saga",
        "SagaState",
        {
            "saga_id": "s1",
            "steps": [{"id": "step-1", "name": "reserve"}],
        },
    ),
    ("human_in_the_loop", "HitlState", {"goal": "approve"}),
]


@pytest.mark.parametrize(("pattern_dir", "model_name", "kwargs"), _CASES, ids=[c[0] for c in _CASES])
def test_schema_imports_and_validates(pattern_dir: str, model_name: str, kwargs: dict[str, Any]) -> None:
    module = _load(pattern_dir)
    model_cls = getattr(module, model_name, None)
    assert model_cls is not None, f"{pattern_dir}: {model_name} not exported"
    instance = model_cls(**kwargs)
    dumped = instance.model_dump()
    assert isinstance(dumped, dict)


def test_every_pattern_has_a_schemas_dir() -> None:
    """Catches the case where a new pattern lands without a schema file."""
    pattern_dirs = sorted(p.name for p in PATTERNS_DIR.iterdir() if p.is_dir() and not p.name.startswith("."))
    covered = {c[0] for c in _CASES}
    missing = [d for d in pattern_dirs if d not in covered]
    assert not missing, (
        f"Patterns without coverage in test_schemas_importable: {missing}. "
        "Add a (pattern_dir, primary_model, kwargs) entry to _CASES "
        "and create patterns/<dir>/schemas/state.py + __init__.py."
    )


# Framework-agnostic sibling files that must import their canonical
# domain types from ``patterns/<name>/schemas/state.py`` rather than
# re-declaring them inline. React has no top-level sibling (only framework
# adapter subdirs), so the canonical-import gate applies through the
# adapter-level coverage below.
_SIBLING_CASES: list[tuple[str, str]] = [
    ("event_driven", "code/python/event_driven.py"),
    ("human_in_the_loop", "code/python/approval.py"),
    ("memory", "code/python/memory_agent.py"),
    ("multi_agent", "code/python/multi_agent.py"),
    ("plan_and_execute", "code/python/plan_and_execute.py"),
    ("rag", "code/python/rag.py"),
    ("reflection", "code/python/reflection.py"),
    ("routing", "code/python/routing.py"),
    ("saga", "code/python/saga.py"),
    ("tool_use", "code/python/tool_use.py"),
]


@pytest.mark.parametrize(("pattern", "relpath"), _SIBLING_CASES, ids=[c[0] for c in _SIBLING_CASES])
def test_sibling_imports_canonical_state(pattern: str, relpath: str) -> None:
    """Each pattern's framework-agnostic sibling imports its canonical
    state schema rather than redeclaring it inline.

    Without this gate, a rename in ``schemas/state.py`` silently desyncs
    from the sibling, and a new framework adapter can forget the import
    entirely (the failure mode PR #38 deliberately punted on).
    """
    src = (PATTERNS_DIR / pattern / relpath).read_text(encoding="utf-8")
    needle = f"from patterns.{pattern}.schemas.state import"
    assert needle in src, f"{pattern}: sibling at {relpath} missing canonical import"
