# ReAct — Architecture

> Architecture level. The static structure — the parts of a ReAct agent and how
> they connect. For runtime behaviour see [Flow](./flow.md); for the prose
> component walkthrough, diagram, and failure/scaling detail see [Design](./design.md).

```yaml level=architecture
components:
  - { id: loop_controller, role: engine, responsibility: "Drive the think-act-observe cycle; resolve the next step via the planner policy" }
  - { id: model, role: reasoner, responsibility: "Reason over state + tool schemas; emit a tool call or a final answer", port: model }
  - { id: tool_dispatcher, role: effector, responsibility: "Validate + route tool calls; turn results (and errors) into observations", port: tools }
  - { id: history, role: state, responsibility: "Accumulate messages + observations — the agent's working memory" }
  - { id: iteration_guard, role: policy, responsibility: "Enforce max_steps and repeat-detection; force termination" }
edges:
  - { from: loop_controller, to: model }
  - { from: model, to: tool_dispatcher, when: "response is a tool call" }
  - { from: model, to: history, when: "response is a final answer" }
  - { from: tool_dispatcher, to: history }
  - { from: history, to: loop_controller }
ports:
  - { name: model, protocol: model, required: true }
  - { name: tools, protocol: tools, required: true }
```

## Components

- **Loop controller** — the [Engine](../../core/architecture.md#engine) instance for this pattern. Each turn it sends the history to the model, classifies the response (tool call vs final answer), dispatches tool calls, appends observations, and checks the guard.
- **Model (reasoning engine)** — bound to the `model` port. Receives the system prompt, the tool schemas, and the full history; returns a tool-call request or a text answer.
- **Tool dispatcher + registry** — bound to the `tools` port. Maps tool name → handler, validates arguments against the schema, and converts results or errors into observations the model can read.
- **Message history** — the working-memory slice of [Run State](../../core/architecture.md#run-state). It grows ~2 messages per iteration, which is why context management (truncate / summarize / sliding window) is a first-class concern.
- **Iteration guard** — the [Control Policy](../../core/architecture.md#control-policy)'s termination arm: the mandatory `max_steps` cap plus repeat detection.

## Ports

ReAct needs two ports: a **model** port (the reasoner) and a **tools** port (the registry / MCP surface). Memory, retrieval, and other ports are added by composing primitives — they are not part of the bare pattern. The concrete adapters behind each port are selected from `agent-deployments`.
