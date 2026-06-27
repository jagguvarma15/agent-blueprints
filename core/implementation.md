# Kernel Implementation

> Implementation level. The buildable contract: the interface stubs, the IR a
> selection compiles to, and the fragment-merge model that turns a set of
> blueprints into one runnable agent.

## Interface stubs

Framework-agnostic reference contracts — Protocols/types only, no runtime. Concrete
implementations live in `agent-deployments`.

| Contract | Python | TypeScript |
|---|---|---|
| Step / Engine / Control Policy | [`interfaces/python/kernel.py`](./interfaces/python/kernel.py) | [`interfaces/typescript/kernel.ts`](./interfaces/typescript/kernel.ts) |
| Ports (model / tools / memory / runtime / agents) | [`interfaces/python/ports.py`](./interfaces/python/ports.py) | [`interfaces/typescript/ports.ts`](./interfaces/typescript/ports.ts) |
| Run State base | [`interfaces/python/state.py`](./interfaces/python/state.py) | [`interfaces/typescript/state.ts`](./interfaces/typescript/state.ts) |

## The IR

A selection compiles to one **intermediate representation** — a declarative
assembly manifest with symbolic `*_ref` leaves, validated by
[`spec/ir.schema.json`](./spec/ir.schema.json). A complete worked example is
[`spec/example.yaml`](./spec/example.yaml).

The IR's sections map onto the kernel: `state` (a ref to a `RunState` subclass),
`steps[]`, `control_policy`, `ports[]`, `cross_cutting[]`, optional `edges[]`, and
`provenance`. Every leaf that would otherwise be framework code is a symbolic
reference (`code_ref`, `schema_ref`, `${ports.x}`), so one IR drives many emitters
(a LangGraph emitter, a plain-async emitter, …). Framework specificity lives only
in the adapter layer.

## How a blueprint contributes: the IR fragment

Every entry declares, at its **Implementation** level, an `ir_fragment` — the
slice of the IR it contributes when selected:

- a **pattern** contributes a `control_policy` and its core `steps`;
- a **primitive** contributes a port and/or a step (e.g. `tool_use` adds the tool
  registry port and a `tool` step; `memory` adds the memory port and a `retrieval`
  step);
- a **modifier** contributes a `cross_cutting` entry that wraps the graph.

## The merge model

The generator composes a selection's fragments into one IR:

1. **Namespace** every step/port id by its entry id (collision-free union;
   recorded in `provenance`).
2. **Check compatibility** against the emitted `compositions[]` edges — reject an
   `anti` pairing, warn on `complex`.
3. **Dedupe ports** by protocol (two entries needing a model share one binding).
4. **Bind ports** to verified `agent-deployments` options (the abstract `memory`
   port becomes `memory_store.pgvector`, etc.).
5. **Emit** procedural code from the merged IR via the target's emitter.

This is how the generator "reaches the needed leaf": it walks
Concepts → Architecture → Flow → Design → Implementation, reads the structured
`ir_fragment`, and resolves each port to the deployments option that realizes it.

## An honest caveat on determinism

The IR makes the *composition* deterministic: the same selection produces the same
merged IR, the same prompts, and the same skeleton. It does **not** make the
generated source bytes deterministic — the generator asks a model to fill the
marked slots. The IR + interface stubs make the model's context complete and
framework-agnostic; they do not replace the model. Treat "deterministic" as
applying to the plan, not the keystrokes.

## Reading an entry leaf-by-leaf

For any blueprint, the five level files answer five questions in order: *why &
when* (Concepts) → *what parts* (Architecture) → *what happens at runtime* (Flow)
→ *what to tune and trade off* (Design) → *how to build it and what it contributes
to the IR* (Implementation). A human reads the prose; the generator reads the
fenced `yaml level=…` blocks. They never disagree because the structured block is
the single source and the prose only explains it.
