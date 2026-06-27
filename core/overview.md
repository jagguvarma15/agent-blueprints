# The Agent Kernel

> Concepts level. The normalized core every blueprint composes onto — the one
> machine that runs both workflows and agents.

The kernel is the small set of abstractions every pattern, primitive, and modifier
in this repo projects onto. Picking a blueprint is a design decision *about the
kernel*: a pattern chooses a **control policy** and a set of **steps**; a primitive
adds a **port** or extends **run state**; a modifier wraps a **cross-cutting**
concern around the graph. Because everything reduces to the same handful of
contracts, the combinations compose instead of multiplying.

This document is the entry point. Read it, then descend:

- **[Architecture](./architecture.md)** — the six elements and their contracts.
- **[Flow](./flow.md)** — how the engine runs a graph at runtime.
- **[Design](./design.md)** — durability, determinism, memory, scale, the hard calls.
- **[Implementation](./implementation.md)** — the interface stubs and the IR a selection compiles to.

## One machine for workflows and agents

A workflow and an agent are the **same machine**: a graph of steps run by an
engine. The only thing that differs is *who picks the next step*.

- **Code picks the next step** — a static graph — and you have a **workflow**.
- **The model picks the next step** — a planner or router — and you have an **agent**.

"Who picks next" is a single swappable **control policy** over one shared engine.
This is the whole workflow-to-agent spectrum collapsed into one dial, and it is why
[`foundations/anatomy-of-an-agent.md`](../foundations/anatomy-of-an-agent.md) can
describe "the agent loop" once and have it hold for every pattern here. The kernel
is the precise, typed statement of that loop.

## The six elements

| Element | One-line role | Contract |
|---|---|---|
| **Step** | One unit of work; everything is a step (LLM, tool, retrieval, sub-graph, human gate, code). | [`interfaces/python/kernel.py`](./interfaces/python/kernel.py) |
| **Engine** | Runs the graph; resolves the next step; retries, traces, checkpoints, pauses/resumes. | `kernel.py` |
| **Control Policy** | Picks the next step. The workflow ↔ agent switch. | `kernel.py` |
| **Run State** | One serializable object threaded through every step; the agent's working memory. | [`interfaces/python/state.py`](./interfaces/python/state.py) |
| **Ports** | The seams to the outside world — model, tools, memory, runtime, other agents. | [`interfaces/python/ports.py`](./interfaces/python/ports.py) |
| **Cross-cutting** | Observability, guardrails, budgets, context assembly, eval — wrapped around the graph. | [Design](./design.md) |

## Additive, not multiplicative

Implement each pattern once against the kernel, each framework / store / runtime
once as a port adapter, and **compose** them. You maintain a *sum* (patterns +
primitives + modifiers + adapters) but can generate the *product* (every coherent
combination). The grid's margins are built by hand here; the
[generator](../composition/blueprint-to-spec-to-scaffold.md) fills the interior.

The composition is mechanical because each blueprint entry declares, at its
Implementation level, an **IR fragment** — the steps, ports, run-state, and
cross-cutting hooks it contributes when selected. A selection's fragments merge
into one [intermediate representation](./spec/ir.schema.json) (an assembly
manifest with symbolic code references), whose abstract ports bind to verified
[`agent-deployments`](https://github.com/jagguvarma15/agent-deployments) options.
See [Implementation](./implementation.md) for the merge model.

## The boundary with agent-deployments

The kernel owns the **design-time** shape of an agent: its steps, its control
policy, its run-state, the ports it needs, and the design-time shape of its
cross-cutting concerns (what a guardrail does to the flow; what a budget caps).
The **operational realization** — which model provider, which vector store, which
durable runtime, which tracing backend — lives in `agent-deployments` and binds to
the kernel's ports. [`foundations/system-design-heritage.md`](../foundations/system-design-heritage.md)
draws the same cognitive-versus-operational line; the kernel's **ports** are the
seam where the two meet.
