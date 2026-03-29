"""
Routing — Intent classification + dispatch to specialized handlers.

An LLM classifier identifies the intent of an incoming request and routes
it to the appropriate specialist handler. Each handler has its own system
prompt, tools, and LLM configuration.

Design doc:  ../../design.md
Overview:    ../../overview.md
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Callable, Protocol


# ── Interface ─────────────────────────────────────────────────────────────────

class LLM(Protocol):
    def generate(self, messages: list[dict]) -> str: ...


# ── Core types ────────────────────────────────────────────────────────────────

@dataclass
class Route:
    name: str
    description: str            # Used by the classifier to decide routing
    system_prompt: str
    handler: Callable[[str, LLM], str] | None = None  # Custom handler, or default LLM call


@dataclass
class RouteResult:
    route_name: str
    response: str
    confidence: float = 1.0
    used_fallback: bool = False


# ── Classifier prompt ─────────────────────────────────────────────────────────

CLASSIFY_PROMPT = """\
Classify the following user message into one of the available routes.

Routes:
{routes}

User message: {message}

Respond with a JSON object:
{{"route": "<route_name>", "confidence": <0.0-1.0>, "reason": "<brief explanation>"}}

Return only the JSON object."""


# ── Implementation ────────────────────────────────────────────────────────────

class Router:
    """
    Classifies incoming requests and dispatches to registered route handlers.

    Usage:
        router = Router(classifier_llm)
        router.add_route(Route(name="billing", ...))
        result = router.route("I need help with my invoice")
    """

    def __init__(
        self,
        classifier: LLM,
        fallback_route: str | None = None,
        confidence_threshold: float = 0.5,
    ):
        self.classifier = classifier
        self.fallback_route = fallback_route
        self.confidence_threshold = confidence_threshold
        self._routes: dict[str, Route] = {}

    def add_route(self, route: Route) -> None:
        self._routes[route.name] = route

    def _classify(self, message: str) -> tuple[str, float]:
        route_descriptions = "\n".join(
            f"- {r.name}: {r.description}" for r in self._routes.values()
        )
        messages = [{"role": "user", "content": CLASSIFY_PROMPT.format(
            routes=route_descriptions, message=message
        )}]
        raw = self.classifier.generate(messages)
        try:
            data = json.loads(raw)
            return data.get("route", ""), float(data.get("confidence", 0.5))
        except (json.JSONDecodeError, ValueError):
            return "", 0.0

    def _handle(self, route: Route, message: str, handler_llm: LLM) -> str:
        if route.handler:
            return route.handler(message, handler_llm)

        messages = [
            {"role": "system", "content": route.system_prompt},
            {"role": "user", "content": message},
        ]
        return handler_llm.generate(messages)

    def route(
        self,
        message: str,
        handler_llm: LLM | None = None,
    ) -> RouteResult:
        """
        Classify and handle a message.
        handler_llm: LLM used for handler calls (defaults to classifier LLM).
        """
        executor = handler_llm or self.classifier
        route_name, confidence = self._classify(message)

        # Fallback if classification failed or confidence too low
        used_fallback = False
        if route_name not in self._routes or confidence < self.confidence_threshold:
            if self.fallback_route and self.fallback_route in self._routes:
                route_name = self.fallback_route
                used_fallback = True
            elif self._routes:
                route_name = next(iter(self._routes))
                used_fallback = True
            else:
                return RouteResult(
                    route_name="none",
                    response="No routes configured.",
                    confidence=0.0,
                    used_fallback=True,
                )

        route = self._routes[route_name]
        response = self._handle(route, message, executor)

        return RouteResult(
            route_name=route_name,
            response=response,
            confidence=confidence,
            used_fallback=used_fallback,
        )


# ── Example ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":

    class MockLLM:
        def generate(self, messages: list[dict]) -> str:
            content = messages[-1]["content"]
            if '"route"' in content or "Routes:" in content:
                # Classifier
                if "invoice" in content.lower() or "billing" in content.lower():
                    return json.dumps({"route": "billing", "confidence": 0.95, "reason": "billing question"})
                elif "bug" in content.lower() or "error" in content.lower():
                    return json.dumps({"route": "technical", "confidence": 0.90, "reason": "technical issue"})
                return json.dumps({"route": "general", "confidence": 0.70, "reason": "general inquiry"})
            # Handler
            return f"[Handled by {messages[0].get('content', 'unknown')[:30]}...]: {content[:60]}"

    router = Router(
        classifier=MockLLM(),
        fallback_route="general",
        confidence_threshold=0.5,
    )

    router.add_route(Route(
        name="billing",
        description="Questions about invoices, payments, subscriptions, and pricing",
        system_prompt="You are a billing support specialist. Be precise about payment details.",
    ))
    router.add_route(Route(
        name="technical",
        description="Bug reports, error messages, API issues, and technical troubleshooting",
        system_prompt="You are a technical support engineer. Ask for logs and reproduction steps.",
    ))
    router.add_route(Route(
        name="general",
        description="General questions, product info, and anything else",
        system_prompt="You are a general support agent. Be helpful and friendly.",
    ))

    for message in [
        "I was charged twice on my invoice this month",
        "Getting a 500 error when calling the API",
        "What are your business hours?",
    ]:
        result = router.route(message)
        print(f"[{result.route_name}] (conf={result.confidence:.2f}) {result.response[:60]}")
