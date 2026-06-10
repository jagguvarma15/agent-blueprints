"""
Skills — File-based, agent-discovered procedural modules.

A small reference loader plus a two-stage matcher:

  Stage 1: deterministic keyword scan over each registered skill's triggers.
  Stage 2: LLM judge picks at most N skills from the Stage 1 candidates.

Skills bodies are NOT held in the registry — only loaded on demand when the
matcher actually selects the skill. That's what makes the registry cheap to
ship at scale (hundreds of skills cost ~30-50 tokens each in the lookup table
until they fire).

Design doc:  ../../design.md
Overview:    ../../overview.md
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from primitives.skills.schemas.state import (  # noqa: F401
    SkillRegistryEntry,
    SkillSelection,
    SkillsState,
)

# ── Interfaces ────────────────────────────────────────────────────────────────
# Implement LLM with any provider; the matcher only uses it for Stage 2.


class LLM(Protocol):
    def generate(self, messages: list[dict]) -> str:
        """Send messages and return the assistant's response text."""
        ...


# ── Frontmatter parsing ───────────────────────────────────────────────────────
#
# Skill bodies are markdown files with YAML frontmatter delimited by `---`.
# A real loader would use PyYAML; this reference avoids the dependency by
# accepting only the small subset of YAML shapes our schema actually needs.


def _split_frontmatter(text: str) -> tuple[dict[str, object], str]:
    if not text.startswith("---\n"):
        raise ValueError("SKILL.md must start with YAML frontmatter delimited by ---")
    end = text.find("\n---\n", 4)
    if end == -1:
        raise ValueError("SKILL.md frontmatter not terminated by ---")
    fm_block = text[4:end]
    body = text[end + 5 :]
    return _parse_yaml_subset(fm_block), body


def _parse_yaml_subset(block: str) -> dict[str, object]:
    """Tiny YAML-ish parser for the small subset of shapes SKILL.md uses.

    Supports:
      - `key: value` (string values; bare or "double quoted" or 'single quoted')
      - `key:` followed by ``- item`` lines (string list)

    Anything more elaborate (nested maps, multi-line scalars) should use the
    upstream `pyyaml` parser; this is a no-deps fallback for the demo.
    """
    result: dict[str, object] = {}
    current_list: list[str] | None = None
    for raw in block.splitlines():
        line = raw.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue
        if line.startswith("  - ") or line.startswith("- "):
            item = line.split("- ", 1)[1].strip()
            item = item.strip('"').strip("'")
            if current_list is None:
                raise ValueError(f"list item with no parent key: {line!r}")
            current_list.append(item)
            continue
        if ":" in line and not line.startswith(" "):
            key, _, val = line.partition(":")
            key = key.strip()
            val = val.strip()
            if val == "":
                current_list = []
                result[key] = current_list
            else:
                val = val.strip('"').strip("'")
                result[key] = val
                current_list = None
    return result


# ── Registry ──────────────────────────────────────────────────────────────────


class SkillRegistry:
    """In-memory registry. Built once at boot, queried per turn.

    Bodies are NEVER held here — only ``body_path`` references. Reading the
    body happens in :func:`inject_skill_bodies` when the matcher has picked.
    """

    def __init__(self) -> None:
        self.skills: dict[str, SkillRegistryEntry] = {}

    def load(self, skills_root: Path) -> None:
        for skill_md in sorted(skills_root.glob("*/SKILL.md")):
            entry = self._parse(skill_md)
            if entry.id in self.skills:
                raise RuntimeError(f"duplicate skill id: {entry.id}")
            self.skills[entry.id] = entry

    def register(self, entry: SkillRegistryEntry) -> None:
        """In-process registration; useful for tests and dev demos."""
        if entry.id in self.skills:
            raise RuntimeError(f"duplicate skill id: {entry.id}")
        self.skills[entry.id] = entry

    def _parse(self, path: Path) -> SkillRegistryEntry:
        text = path.read_text(encoding="utf-8")
        frontmatter, _ = _split_frontmatter(text)
        required = ("id", "name", "version", "description", "triggers")
        for key in required:
            if key not in frontmatter:
                raise ValueError(f"{path}: missing required frontmatter key {key!r}")
        triggers = frontmatter["triggers"]
        if not isinstance(triggers, list):
            raise ValueError(f"{path}: 'triggers' must be a list")
        return SkillRegistryEntry(
            id=str(frontmatter["id"]),
            name=str(frontmatter["name"]),
            version=str(frontmatter["version"]),
            description=str(frontmatter["description"]),
            triggers=[str(t).lower() for t in triggers],
            when_to_use=(str(frontmatter.get("when_to_use")) if frontmatter.get("when_to_use") else None),
            body_path=str(path),
            scripts_dir=str(path.parent / "scripts"),
        )


# ── Grants ────────────────────────────────────────────────────────────────────


@dataclass
class GrantPolicy:
    """Per-role skill access control. ``allow_all`` short-circuits the lookup."""

    role_grants: dict[str, dict[str, object]] = field(default_factory=dict)

    def allows(self, *, role: str, skill_id: str) -> bool:
        grant = self.role_grants.get(role, {})
        if skill_id in grant.get("denied", []):  # type: ignore[operator]
            return False
        if grant.get("allow_all"):
            return True
        allowed = grant.get("allowed", [])
        return skill_id in allowed  # type: ignore[operator]


# ── Two-stage matcher ─────────────────────────────────────────────────────────


_JUDGE_PROMPT = """\
You are picking AT MOST {max_pick} skills the agent should load to answer the user.

User said: {user_msg}

Candidates:
{candidates}

Reply with a JSON array of skill ids (subset of the candidates). Empty array OK.
Return only the array."""


class SkillMatcher:
    """Two-stage matcher: keyword scan → optional LLM pick.

    Stage 1 is deterministic and cheap. Stage 2 only runs when Stage 1
    produced more than one candidate AND a ``judge_llm`` is provided.
    """

    def __init__(
        self,
        registry: SkillRegistry,
        grants: GrantPolicy | None = None,
        judge_llm: LLM | None = None,
        role: str = "default",
        max_stage1_candidates: int = 5,
        max_picks: int = 2,
    ) -> None:
        self.registry = registry
        self.grants = grants
        self.judge_llm = judge_llm
        self.role = role
        self.max_stage1_candidates = max_stage1_candidates
        self.max_picks = max_picks

    def select(self, user_msg: str) -> SkillsState:
        lowered = user_msg.lower()
        eligible = [
            s
            for s in self.registry.skills.values()
            if self.grants is None or self.grants.allows(role=self.role, skill_id=s.id)
        ]

        # Stage 1: substring scan with density ranking.
        scored: list[tuple[int, SkillRegistryEntry]] = []
        for skill in eligible:
            density = sum(1 for t in skill.triggers if t in lowered)
            if density > 0:
                scored.append((density, skill))
        scored.sort(key=lambda pair: pair[0], reverse=True)
        candidates = [s.id for _, s in scored[: self.max_stage1_candidates]]

        state = SkillsState(
            user_message=user_msg,
            registry_size=len(eligible),
            candidates=candidates,
        )

        if not candidates:
            return state

        if len(candidates) == 1 or self.judge_llm is None:
            picked_ids = candidates[:1]
            via = "stage1_only"
        else:
            picked_ids = self._stage2(user_msg, candidates)
            via = "stage2_judge"
            state.judge_model = "judge"

        for skill_id in picked_ids:
            state.selected.append(
                SkillSelection(
                    skill_id=skill_id,
                    activated_via=via,  # type: ignore[arg-type]
                )
            )
        return state

    def _stage2(self, user_msg: str, candidate_ids: list[str]) -> list[str]:
        candidates_block = "\n".join(f"- {sid}: {self.registry.skills[sid].description}" for sid in candidate_ids)
        prompt = _JUDGE_PROMPT.format(
            max_pick=self.max_picks,
            user_msg=user_msg,
            candidates=candidates_block,
        )
        raw = self.judge_llm.generate(  # type: ignore[union-attr]
            [{"role": "user", "content": prompt}]
        )
        try:
            picked = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return candidate_ids[:1]
        if not isinstance(picked, list):
            return candidate_ids[:1]
        return [p for p in picked if isinstance(p, str) and p in candidate_ids][: self.max_picks]


# ── Body injection ────────────────────────────────────────────────────────────


def inject_skill_bodies(prompt_parts: list[str], state: SkillsState, registry: SkillRegistry) -> list[str]:
    """Read each picked skill's body and append it to ``prompt_parts``.

    Skills extend the system policy: bodies go AFTER the recipe's static
    system prompt and BEFORE the conversation history.
    """
    out = list(prompt_parts)
    for sel in state.selected:
        entry = registry.skills.get(sel.skill_id)
        if entry is None:
            continue
        body_path = Path(entry.body_path)
        text = body_path.read_text(encoding="utf-8")
        _, body = _split_frontmatter(text)
        out.append(f"<!-- skill: {entry.id} v{entry.version} -->")
        out.append(body.strip())
        sel.body_tokens = len(body) // 4  # rough estimate; tokenizer would be exact
    return out


# ── Example ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":

    class MockJudgeLLM:
        """Returns the top candidate to demonstrate the stage-2 wiring."""

        def generate(self, messages: list[dict]) -> str:
            content = messages[-1]["content"]
            first_id_marker = "\n- "
            start = content.find(first_id_marker)
            if start == -1:
                return "[]"
            id_part = content[start + len(first_id_marker) :].split(":", 1)[0].strip()
            return json.dumps([id_part])

    # Build a small in-memory registry without touching disk.
    registry = SkillRegistry()
    registry.register(
        SkillRegistryEntry(
            id="web-search-loop",
            name="Web Search Loop",
            version="0.3.0",
            description="Run a multi-step web search loop: search, extract, cite.",
            triggers=["research", "look up", "investigate"],
            when_to_use="Open-ended factual questions that need live sources.",
            body_path="/dev/null",
        )
    )
    registry.register(
        SkillRegistryEntry(
            id="code-review-checklist",
            name="Code Review Checklist",
            version="1.1.0",
            description="Walk a 5-step review checklist for a pull request.",
            triggers=["review my code", "code review", "pull request"],
            when_to_use="The user wants a structured review of code or a PR.",
            body_path="/dev/null",
        )
    )

    matcher = SkillMatcher(registry=registry, judge_llm=MockJudgeLLM())

    state_a = matcher.select("Can you research how MCP servers handle OAuth 2.1?")
    print(f"Query A picked: {state_a.selected_ids}  (via stage1/judge mix)")

    state_b = matcher.select("Please review my code for the auth handler.")
    print(f"Query B picked: {state_b.selected_ids}")

    state_c = matcher.select("Tell me a joke.")
    print(f"Query C picked: {state_c.selected_ids}  (empty — no triggers fired)")
