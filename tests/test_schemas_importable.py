"""Smoke test: every pattern's canonical Pydantic state schema imports and instantiates.

Loaded via ``importlib`` because several pattern directories use hyphens
(``multi-agent``, ``plan-and-execute``, ``human-in-the-loop``) which are
not valid Python module names. The schemas themselves are self-contained
(no cross-pattern imports), so file-path loading is sufficient.

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
    # Unique module name to avoid sys.modules collisions across hyphenated dirs.
    mod_name = f"_pattern_schema_{pattern_dir.replace('-', '_')}"
    spec = importlib.util.spec_from_file_location(mod_name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = module
    spec.loader.exec_module(module)
    return module


# Per the brief — pattern dir → (primary model name, minimal valid kwargs).
# The kwargs exercise the model's required fields; auxiliary models are
# validated transitively when constructed via the primary.
_CASES: list[tuple[str, str, dict[str, Any]]] = [
    ("react", "ReActState", {"question": "what?"}),
    ("tool-use", "ToolUseState", {"user_message": "hi"}),
    ("plan-and-execute", "PlanExecuteState", {"goal": "ship"}),
    ("reflection", "ReflectionState", {"goal": "write"}),
    ("routing", "RoutingState", {
        "request": "billing question",
        "available_routes": [{"name": "billing", "description": "money stuff"}],
    }),
    ("rag", "RagState", {"query": {"text": "what is x?"}}),
    ("memory", "MemoryState", {"user_id": "u1", "user_message": "hi"}),
    ("multi-agent", "MultiAgentState", {"user_goal": "ship"}),
    ("event-driven", "EventDrivenState", {
        "current_event": {
            "event_id": "e1",
            "event_type": "x.created",
            "occurred_at": datetime(2026, 1, 1),
        },
    }),
    ("saga", "SagaState", {
        "saga_id": "s1",
        "steps": [{"id": "step-1", "name": "reserve"}],
    }),
    ("human-in-the-loop", "HitlState", {"goal": "approve"}),
]


@pytest.mark.parametrize(("pattern_dir", "model_name", "kwargs"), _CASES, ids=[c[0] for c in _CASES])
def test_schema_imports_and_validates(
    pattern_dir: str, model_name: str, kwargs: dict[str, Any]
) -> None:
    module = _load(pattern_dir)
    model_cls = getattr(module, model_name, None)
    assert model_cls is not None, f"{pattern_dir}: {model_name} not exported"
    instance = model_cls(**kwargs)
    dumped = instance.model_dump()
    assert isinstance(dumped, dict)


def test_every_pattern_has_a_schemas_dir() -> None:
    """Catches the case where a new pattern lands without a schema file."""
    pattern_dirs = sorted(
        p.name for p in PATTERNS_DIR.iterdir() if p.is_dir() and not p.name.startswith(".")
    )
    covered = {c[0] for c in _CASES}
    missing = [d for d in pattern_dirs if d not in covered]
    assert not missing, (
        f"Patterns without coverage in test_schemas_importable: {missing}. "
        "Add a (pattern_dir, primary_model, kwargs) entry to _CASES "
        "and create patterns/<dir>/schemas/state.py + __init__.py."
    )
