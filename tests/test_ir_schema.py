"""The composition IR schema is well-formed and the worked example conforms to it.

This is the one place the IR contract (``core/spec/ir.schema.json``) is enforced.
Per-entry ``ir_fragment`` blocks are illustrative sketches (see
``core/implementation.md``); ``core/spec/example.yaml`` is the fully-validated IR.

Run with:

    uv run --with 'PyYAML,jsonschema' pytest tests/test_ir_schema.py
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator

REPO_ROOT = Path(__file__).resolve().parent.parent
SPEC_DIR = REPO_ROOT / "core" / "spec"


def _load_schema() -> Any:
    return json.loads((SPEC_DIR / "ir.schema.json").read_text(encoding="utf-8"))


def test_ir_schema_is_valid_jsonschema() -> None:
    """ir.schema.json must itself be a valid Draft 2020-12 schema."""
    Draft202012Validator.check_schema(_load_schema())


def test_ir_example_conforms_to_schema() -> None:
    """The worked example IR must validate against the schema."""
    schema = _load_schema()
    example = yaml.safe_load((SPEC_DIR / "example.yaml").read_text(encoding="utf-8"))
    errors = sorted(Draft202012Validator(schema).iter_errors(example), key=str)
    assert not errors, "example.yaml does not conform:\n" + "\n".join(f"  {list(e.path)}: {e.message}" for e in errors)
