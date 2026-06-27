# ReAct — Flow

> Flow level. The runtime behaviour — how a ReAct run proceeds step by step and
> how it terminates. For the static structure see [Architecture](./architecture.md);
> for error handling and termination depth see [Design](./design.md).

```yaml level=flow
control_flow: loop
steps:
  - { n: 1, actor: model, action: "reason about current state + goal" }
  - { n: 2, actor: model, action: "decide: emit a tool call, or a final answer" }
  - { n: 3, actor: tool_dispatcher, action: "execute the tool, append the observation" }
state: [messages, steps, final_answer, terminated_reason]
termination:
  condition: "model returns a final answer"
  max_iterations: 8
  fallback: "return best-so-far (stopped_by_guard = true)"
```

## The loop

The control policy is a **planner**: the model picks the next move each turn, which is what makes ReAct an agent rather than a workflow.

1. The loop controller sends the system prompt, tool schemas, and full history to the model.
2. The model returns either a **tool call** (name + arguments) or a **final answer**.
3. On a tool call, the dispatcher validates and executes it, then appends the observation to history; control returns to step 1.
4. On a final answer, the run terminates with `terminated_reason = "answer"`.

Each iteration adds roughly two messages (the assistant tool call + the tool result). All non-determinism — the model's choice and the tool's output — is recorded into Run State, so a recorded run replays exactly (the kernel's [determinism contract](../../core/design.md#determinism-and-replay)).

## Termination

A ReAct loop without an explicit termination policy is a budget bug. The layers, in order of importance:

- **Iteration cap (mandatory).** `max_steps` — a hard ceiling. On hit, return the best answer so far with `stopped_by_guard = true`.
- **Repeat detection.** Same tool + same args twice → inject a "try something else" hint; three times → terminate.
- **Explicit done-tool.** A `finalize_answer` tool is often the cleanest stop signal.
- **Token / cost budget.** Catches long-context blow-ups the step cap alone misses.

See [Design](./design.md#termination-strategies) for the full treatment.
