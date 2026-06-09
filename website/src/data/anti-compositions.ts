/**
 * Anti-composition warnings, hand-curated from
 * `composition/anti-compositions.md`. Surfaced on per-pattern pages as
 * callouts.
 *
 * IDs match the catalog (use the on-disk id form — `multi_agent`, not
 * `multi-agent`). The `severity` field tunes the visual tone:
 *   - 'caution'   — composable with care; the pairing is documented as nuanced
 *   - 'avoid'     — the default composition is wrong; pick a different shape
 *   - 'redundant' — the two patterns solve the same problem; use one
 *
 * Add to this list when `composition/anti-compositions.md` grows. A future
 * follow-up will parse the markdown into this shape automatically.
 */

export type AntiCompositionSeverity = 'caution' | 'avoid' | 'redundant';

export interface AntiComposition {
  pair: [string, string];
  severity: AntiCompositionSeverity;
  headline: string;
  rationale: string;
  /** What to do instead — short, action-oriented. */
  recommend: string;
}

export const ANTI_COMPOSITIONS: AntiComposition[] = [
  {
    pair: ['multi_agent', 'reflection'],
    severity: 'caution',
    headline: 'Multi-Agent + Reflection on small tasks',
    rationale:
      'Multi-agent already carries 3–5× the cost and latency of a single agent. Adding reflection at least doubles per-worker cost and serializes execution. On tasks the simpler patterns handle, you spend 6–10× the budget for marginal quality gain that does not survive eval.',
    recommend:
      'Pick one. Reflection on a single ReAct agent often delivers 80% of the quality gain at a fraction of the cost. Add multi-agent + reflection only with an eval baseline that justifies the premium.',
  },
  {
    pair: ['rag', 'react'],
    severity: 'avoid',
    headline: 'RAG + ReAct without retrieval grounding',
    rationale:
      "RAG's value is grounding. Without citation enforcement, the agent treats retrieved chunks as suggestions and may cite them selectively to support claims they do not actually support. You pay retrieval cost without getting the hallucination defense.",
    recommend:
      "Schema-enforce citations (claims must cite a retrieved span) or drop RAG and use the agent's parametric knowledge.",
  },
  {
    pair: ['memory', 'multi_agent'],
    severity: 'avoid',
    headline: 'Memory + Multi-Agent without scoped writes',
    rationale:
      "Memory's failure mode is poisoning. Multi-agent's failure mode is propagation. Composed without per-agent scopes, every worker can poison every other worker, and debugging requires reconstructing a multi-actor write history.",
    recommend:
      'Give each agent its own memory scope (read-mostly cross-scope), or designate one memory-writer agent that owns all writes through an approval surface.',
  },
  {
    pair: ['plan_and_execute', 'reflection'],
    severity: 'caution',
    headline: 'Plan & Execute + Reflection on the plan without execution feedback',
    rationale:
      'Reflecting on a plan before any step runs sounds principled, but the critic has no execution feedback. A plan that looks good often fails at step 3 in ways the critic could not predict.',
    recommend:
      'Either skip pre-execution reflection and reflect on results, or add a second reflection pass after execution so both failure modes are caught.',
  },
  {
    pair: ['evaluator-optimizer', 'reflection'],
    severity: 'redundant',
    headline: 'Evaluator-Optimizer + Reflection',
    rationale:
      'Evaluator-Optimizer is already a reflection loop with an external scoring signal. Stacking them stacks two convergence mechanisms with different criteria; they oscillate against each other.',
    recommend:
      'Pick one. Evaluator-Optimizer when you have a measurable target; Reflection when criteria are softer or the evaluator itself is hard to build.',
  },
  {
    pair: ['routing', 'multi_agent'],
    severity: 'redundant',
    headline: 'Routing + Multi-Agent supervisor classifying on the same axis',
    rationale:
      "Two classifiers in series. The router's output becomes the supervisor's input; the supervisor re-derives the same classification. Cost paid twice, failure surface doubled.",
    recommend:
      'Collapse to one classifier — the router calls workers directly, or the supervisor handles routing as its first internal step. Compose only when the two classifiers operate on different dimensions.',
  },
  {
    pair: ['orchestrator-worker', 'plan_and_execute'],
    severity: 'redundant',
    headline: 'Orchestrator-Worker + Plan & Execute (both decomposing)',
    rationale:
      'Both patterns are "decompose then dispatch." Orchestrator-Worker decomposes dynamically; Plan & Execute decomposes upfront. Composing them means decomposing twice.',
    recommend:
      'Pick the decomposition timing. Plan & Execute when decomposition is stable enough to commit upfront; Orchestrator-Worker when decomposition emerges during execution.',
  },
  {
    pair: ['memory', 'rag'],
    severity: 'caution',
    headline: 'Memory + RAG over the same corpus and namespace',
    rationale:
      'Memory is time-ordered, agent-owned context. RAG is topic-organized, externally-authored knowledge. Indexing them identically loses the type distinction and duplicates retrieval logic.',
    recommend:
      'Same vector store infrastructure is fine; use separate namespaces with separate retrieval logic. Memory retrieval is recency-weighted, RAG retrieval is similarity-weighted.',
  },
  {
    pair: ['multi_agent', 'memory'],
    severity: 'avoid',
    headline: 'Multi-Agent + Long-Term Memory without provenance tags',
    rationale:
      'A poisoned worker poisons the long-term memory; all future agents inherit the poison. Without provenance there is no way to roll back selectively or down-weight a low-trust source.',
    recommend:
      'Tag every memory entry with its source (`source: worker_X`). Apply per-source trust scoring and keep an audit log of writes.',
  },
  {
    pair: ['saga', 'react'],
    severity: 'caution',
    headline: 'Saga + agent-driven steps without compensation contracts',
    rationale:
      "Saga's compensator contract requires `do` to issue a known side effect that `undo` can reverse. An agent's output is variable; a compensator that worked in testing fails in the long tail.",
    recommend:
      'Constrain the agent within a saga step to a fixed output schema. The compensator reverses that schema, not whatever the agent happens to have done.',
  },
  {
    pair: ['event_driven', 'react'],
    severity: 'avoid',
    headline: 'Event-Driven + ReAct without per-event isolation',
    rationale:
      'Events arrive concurrently. Two ReAct loops sharing in-process state can race — one updates the tool registry while another iterates, one reads stale memory, one consumes the wrong loop\'s tool result.',
    recommend:
      "Per-event isolation. Each event's ReAct loop runs with its own state instance. Shared infrastructure (vector store, LLM client) is fine; shared mutable state is not.",
  },
];

/** Return every anti-composition entry where `id` participates in the pair. */
export function antiCompositionsFor(id: string): AntiComposition[] {
  return ANTI_COMPOSITIONS.filter((a) => a.pair[0] === id || a.pair[1] === id);
}
