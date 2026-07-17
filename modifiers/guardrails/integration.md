# Guardrails: classifier integration

How a generated project wires a safety classifier into the input and output layers. This is the concrete companion to [implementation.md](implementation.md) (the detector contract and layer execution) and [design.md](design.md) (policy, fail-open vs fail-closed): everything here plugs into those seams without changing them. Sections are ordered so the wiring comes first.

## Wiring shape

Two detectors, both implementing the `Detector` protocol from [implementation.md](implementation.md):

- **Input classification** runs before the agent loop sees the user message. A blocked input never reaches the model.
- **Output classification** runs on the final answer after the loop, before it reaches the user. A blocked output is replaced by a refusal (or rewritten — see the verdict mapping below).

Hazard-taxonomy classifiers score a single text against a fixed category set, so both layers can share one client:

```python
import os

import httpx

from modifiers.guardrails.schemas.state import Verdict


class HostedClassifierDetector:
    """Input/output safety classification via a hosted classifier.

    The concrete example targets a Llama Guard deployment behind an
    OpenAI-compatible inference API; any hazard-taxonomy classifier with
    the same request shape drops in.
    """

    name = "safety_classifier"
    on_failure = "fail_open"  # see the failure policy section

    def __init__(self, layer: str, model: str = "meta-llama/Llama-Guard-3-8B") -> None:
        self.layer = layer  # "input" or "output"
        self.model = model
        self.api_key = os.environ["TOGETHER_API_KEY"]

    def check(self, text: str) -> Verdict:
        resp = httpx.post(
            "https://api.together.xyz/v1/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": text}],
                "max_tokens": 32,
            },
            timeout=10.0,
        )
        resp.raise_for_status()
        label = resp.json()["choices"][0]["message"]["content"].strip()
        # Llama Guard replies "safe" or "unsafe\n<category>".
        if label.startswith("safe"):
            return Verdict(kind="allow", detector=self.name)
        category = label.splitlines()[-1] if "\n" in label else "unspecified"
        return Verdict(kind="block", detector=self.name, reason=f"classifier:{category}")
```

Wrap the host pattern with `guarded_run` from [implementation.md](implementation.md); the input detector goes in the input layer's detector list, the output detector in the output layer's.

## Verdict mapping

The classifier's binary label maps onto the canonical [`Verdict`](schemas/state.py) kinds:

| Classifier result | Layer | Verdict | Effect |
|---|---|---|---|
| safe | input or output | `allow` | Proceed unchanged |
| unsafe, low-severity category | output | `rewrite` | Route through the policy rewriter prompt |
| unsafe | input | `block` | Refuse before the loop runs |
| unsafe | output | `block` | Replace the answer with a refusal |
| classifier error or timeout | either | per `on_failure` | See failure policy |

Every non-allow verdict lands a `BlockDecision` audit row (see [schemas/state.py](schemas/state.py)) regardless of which effect fired.

## Failure policy

Follow the fail-open vs fail-closed table in [design.md](design.md):

- **Input classification defaults to fail-open.** A classifier outage should degrade to an unguarded-but-audited request, not an outage of the whole agent. Log the failure as a `flag` verdict so calibration sees the gap.
- **Output classification is fail-open for general surfaces and fail-closed for regulated ones.** When the answer must never ship unclassified (medical, financial, minors), a classifier failure blocks with a retriable error instead.

Set the choice per detector via `on_failure`; do not hardcode it inside the detector body — the policy artifact owns it.

## Deployment contract

The provider pin, environment contract, and compose wiring live in the deployments capability doc, not here: [`capabilities/guardrail/llama-guard.md`](https://github.com/jagguvarma15/agent-deployments/blob/main/docs/capabilities/guardrail/llama-guard.md). A generated project that declares the capability gets the env var surfaced by its credential wiring; this doc only defines what the code does with it.

## What to log

Per classification, one structured record: layer (`input`/`output`), verdict kind, classifier category on non-allow, latency, and the truncated text hash (never the raw text — it may itself be the sensitive artifact). These feed the block-rate and false-positive metrics in [observability.md](observability.md), and shadow-mode calibration (run the classifier, log the verdict, enforce nothing) is the first deployment step per [implementation.md](implementation.md).

## Choosing a classifier

| Option | Shape | Wrap as |
|---|---|---|
| Llama Guard family | Hazard-taxonomy classifier, hosted inference API or self-hosted weights | One detector per layer, shared client (above) |
| Moderation endpoints | Per-category scores from a provider API | Detector with per-category thresholds in the policy artifact |
| Programmable rails (NeMo Guardrails) | Dialog- and flow-level rules engine | Wrap the whole loop; keep the layer detectors for defense in depth |

The library-integration table in [implementation.md](implementation.md) covers wrapping strategies for the broader ecosystem.
