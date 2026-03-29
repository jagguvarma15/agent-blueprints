"""
Memory Agent — Persistent state across sessions.

Three memory layers:
  - Working memory:  current conversation history (in-context)
  - Long-term store: key-value facts that persist across sessions
  - Semantic memory: vector-based fuzzy retrieval (interface provided)

Design doc:  ../../design.md
Overview:    ../../overview.md
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Protocol


# ── Interfaces ────────────────────────────────────────────────────────────────

class LLM(Protocol):
    def generate(self, messages: list[dict]) -> str: ...


class VectorStore(Protocol):
    """Implement with any embedding + retrieval backend (Chroma, Pinecone, etc.)"""
    def add(self, text: str, metadata: dict) -> None: ...
    def search(self, query: str, top_k: int = 3) -> list[dict]: ...


# ── Memory stores ─────────────────────────────────────────────────────────────

@dataclass
class WorkingMemory:
    """Short-term: the rolling conversation window passed to the LLM."""
    max_turns: int = 20

    def __post_init__(self):
        self._history: list[dict] = []

    def add(self, role: str, content: str) -> None:
        self._history.append({"role": role, "content": content})
        # Trim to window (keep system message if present)
        if len(self._history) > self.max_turns * 2:
            system = [m for m in self._history if m["role"] == "system"]
            rest = [m for m in self._history if m["role"] != "system"]
            self._history = system + rest[-(self.max_turns * 2):]

    def get(self) -> list[dict]:
        return list(self._history)


class LongTermStore:
    """
    Persistent key-value store for structured facts.
    Backed by a simple dict here; replace with a real DB in production.
    """

    def __init__(self):
        self._store: dict[str, str] = {}

    def set(self, key: str, value: str) -> None:
        self._store[key] = value

    def get(self, key: str) -> str | None:
        return self._store.get(key)

    def search(self, query: str) -> dict[str, str]:
        """Simple substring search; replace with real search in production."""
        q = query.lower()
        return {k: v for k, v in self._store.items() if q in k.lower() or q in v.lower()}

    def all(self) -> dict[str, str]:
        return dict(self._store)


# ── Memory agent ──────────────────────────────────────────────────────────────

EXTRACT_PROMPT = """\
Extract any important facts, preferences, or information from this conversation turn
that should be remembered for future sessions.

User message: {user_message}
Assistant response: {assistant_response}

Return a JSON object with key-value pairs to store, or an empty object {{}} if nothing
is worth remembering. Keep keys short and descriptive (e.g., "user_name", "prefers_python").

Return only the JSON object."""


class MemoryAgent:
    """
    An LLM agent that maintains memory across turns and sessions.

    At each turn:
    1. Retrieve relevant memories from long-term store
    2. Generate a response using working memory + retrieved context
    3. Extract and persist new facts from the exchange
    """

    def __init__(
        self,
        llm: LLM,
        system: str = "You are a helpful assistant with memory.",
        max_working_memory_turns: int = 20,
        vector_store: VectorStore | None = None,
    ):
        self.llm = llm
        self.working = WorkingMemory(max_turns=max_working_memory_turns)
        self.long_term = LongTermStore()
        self.vector_store = vector_store  # Optional semantic memory

        self.working.add("system", system)

    def _retrieve_context(self, query: str) -> str:
        parts: list[str] = []

        # Long-term keyword search
        matches = self.long_term.search(query)
        if matches:
            parts.append("Known facts:\n" + "\n".join(f"- {k}: {v}" for k, v in matches.items()))

        # Semantic search (optional)
        if self.vector_store:
            results = self.vector_store.search(query, top_k=3)
            if results:
                parts.append("Related memories:\n" + "\n".join(
                    f"- {r.get('text', '')}" for r in results
                ))

        return "\n\n".join(parts)

    def _extract_and_store(self, user_message: str, assistant_response: str) -> None:
        messages = [{"role": "user", "content": EXTRACT_PROMPT.format(
            user_message=user_message,
            assistant_response=assistant_response,
        )}]
        raw = self.llm.generate(messages)
        try:
            facts = json.loads(raw)
            for key, value in facts.items():
                self.long_term.set(key, str(value))
            # Also store in semantic memory if available
            if self.vector_store and facts:
                self.vector_store.add(
                    text=f"{user_message} → {assistant_response}",
                    metadata={"facts": facts},
                )
        except (json.JSONDecodeError, AttributeError):
            pass

    def chat(self, user_message: str) -> str:
        # Build context-enriched prompt
        context = self._retrieve_context(user_message)
        augmented_message = user_message
        if context:
            augmented_message = f"{context}\n\n---\n\nUser: {user_message}"

        self.working.add("user", augmented_message)
        response = self.llm.generate(self.working.get())
        self.working.add("assistant", response)

        # Asynchronously extract and persist new facts
        self._extract_and_store(user_message, response)

        return response

    @property
    def memory_snapshot(self) -> dict:
        return self.long_term.all()


# ── Example ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":

    class MockLLM:
        def generate(self, messages: list[dict]) -> str:
            last = messages[-1]["content"]
            if "Extract any important facts" in last:
                return json.dumps({"user_language": "Python", "user_project": "agent system"})
            return f"[response to: {last[:60]}]"

    agent = MemoryAgent(
        llm=MockLLM(),
        system="You are a helpful coding assistant that remembers user preferences.",
    )

    # Turn 1: user provides context
    r1 = agent.chat("I mostly work in Python and I'm building an agent system.")
    print(f"Turn 1: {r1}")
    print(f"Memory: {agent.memory_snapshot}")

    # Turn 2: memory is recalled
    r2 = agent.chat("What's the best way to handle errors in my project?")
    print(f"\nTurn 2: {r2}")
