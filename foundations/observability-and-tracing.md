# Observability and Tracing

You cannot debug, evaluate, or trust an agent you cannot see. Where a workflow's
behaviour is fixed by code, an agent's behaviour is decided at runtime by the
model — so the **trace of what it actually did** is the primary artifact for
debugging, evaluation, cost control, and incident response. Observability is a
first-class [cross-cutting concern](../core/design.md#cross-cutting-concerns) of
the kernel, not an afterthought.

> **Boundary.** This doc covers the *design-time* shape of observability — what to
> emit and why. The *operational* realization (which backend: OTel collector,
> Langfuse, Phoenix, a cloud tracer) lives in
> [agent-deployments](https://github.com/jagguvarma15/agent-deployments).

## The unit of observability is the step

The kernel emits one **span per [Step](../core/architecture.md#step)** over the
same event bus that feeds streaming. A run is therefore a tree of spans:

- **run / invoke_agent** — the whole task: goal, final status, total tokens/cost, wall-clock.
- **step** — one think/act/observe unit: kind, inputs/outputs (refs into Run State), latency, status, retries.
- **tool / execute_tool** — name, validated args, result size, success/error, latency.
- **model / chat** — model id, prompt + completion token counts, cost, stop reason.

Because every step is recorded into Run State (the
[determinism contract](../core/design.md#determinism-and-replay)), the trace is
also a **replayable fixture**: an offline eval can re-run a recorded trajectory
without touching the network.

## OpenTelemetry GenAI conventions

The ecosystem has standardized on the **OpenTelemetry GenAI semantic
conventions** — a shared vocabulary of span names (`invoke_agent`,
`execute_tool`, `chat`) and attributes (`gen_ai.system`, `gen_ai.request.model`,
`gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`). Emitting these makes a
generated agent legible to any conformant backend with no custom glue. Target
them rather than a vendor-specific shape.

## What to trace (minimum surface)

- **Per run:** goal, outcome, step count, total tokens, total cost, time-to-first-token, time-to-final-answer.
- **Per step:** kind, the control-policy decision (which step ran and why), latency, status, retry count.
- **Per tool:** invocation count, success rate, latency, error class.
- **Distributions, not just averages.** A bimodal step-count distribution (a cluster at 1 and another at the cap) usually means two task types that should be routed differently.

## Trajectory evaluation

Span-level tracing enables **trajectory evaluation** — judging not just the final
answer but the *path*: did the agent pick the right tools, in a sensible order,
without redundant calls or loops? Online evals score live traffic against
guardrail metrics; offline evals replay recorded trajectories as a regression
suite (see [Evals and Quality](./evals-and-quality.md)). An LLM-as-judge can score
trajectories, but anchor it with deterministic checks (did the cited tool actually
run? did the answer's claims appear in an observation?).

## Related

- [The kernel's cross-cutting design](../core/design.md#cross-cutting-concerns)
- [Evals and Quality](./evals-and-quality.md)
- [Durability and State](./durability-and-state.md) — the trace and the checkpoint are two views of the same run
- [Cost and Model Selection](./cost-and-model-selection.md) — token/cost attributes power budget enforcement
