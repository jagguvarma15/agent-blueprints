export interface Blueprint {
  id: string;
  name: string;
  complexity: 'Beginner' | 'Intermediate' | 'Advanced';
  pattern: string;
  description: string;
}

export const BLUEPRINTS: Blueprint[] = [
  {
    id: '01-react-agent',
    name: 'ReAct Agent',
    complexity: 'Beginner',
    pattern: 'Orchestration',
    description:
      'A reasoning + acting loop where the agent thinks step-by-step and calls tools to gather information before producing a final answer.',
  },
  {
    id: '02-plan-and-execute',
    name: 'Plan & Execute',
    complexity: 'Intermediate',
    pattern: 'Orchestration',
    description:
      'Separates high-level planning from low-level execution. The planner produces a structured task list; an executor works through each step sequentially.',
  },
  {
    id: '03-reflexion',
    name: 'Reflexion',
    complexity: 'Intermediate',
    pattern: 'Orchestration',
    description:
      'Adds a self-critique loop on top of generation. The agent evaluates its own output, identifies shortcomings, and iteratively improves its response.',
  },
  {
    id: '04-multi-agent-supervisor',
    name: 'Multi-Agent Supervisor',
    complexity: 'Intermediate',
    pattern: 'Multi-agent',
    description:
      'A supervisor agent delegates subtasks to specialised sub-agents and aggregates their results, enabling role-based parallelism with centralised control.',
  },
  {
    id: '05-multi-agent-parallel',
    name: 'Multi-Agent Parallel',
    complexity: 'Intermediate',
    pattern: 'Multi-agent',
    description:
      'Multiple independent agents run concurrently on different slices of a problem and their outputs are merged, maximising throughput for embarrassingly parallel workloads.',
  },
  {
    id: '06-memory-agent',
    name: 'Memory Agent',
    complexity: 'Intermediate',
    pattern: 'Memory',
    description:
      'Augments an agent with short-term working memory and long-term persistent storage so it can recall facts across sessions and avoid repeating work.',
  },
  {
    id: '07-rag-basic',
    name: 'RAG Basic',
    complexity: 'Beginner',
    pattern: 'RAG',
    description:
      'Retrieval-Augmented Generation: embeds a document corpus and retrieves the top-k passages at query time to ground the model response in source material.',
  },
  {
    id: '08-rag-advanced',
    name: 'RAG Advanced',
    complexity: 'Advanced',
    pattern: 'RAG',
    description:
      'Extends basic RAG with query rewriting, hybrid search, re-ranking, and answer faithfulness checks for production-grade retrieval quality.',
  },
  {
    id: '09-tool-calling',
    name: 'Tool Calling',
    complexity: 'Beginner',
    pattern: 'Tools',
    description:
      'Demonstrates structured tool / function calling: defining tool schemas, dispatching calls, handling results, and feeding them back into the conversation.',
  },
  {
    id: '10-human-in-the-loop',
    name: 'Human-in-the-Loop',
    complexity: 'Intermediate',
    pattern: 'Control flow',
    description:
      'Pauses agent execution at key decision points to request human review or approval, combining automated reasoning with human oversight for high-stakes actions.',
  },
];

/**
 * Look up a blueprint by its numeric prefix or full id.
 * Accepts both "01" and "01-react-agent".
 */
export function findBlueprint(query: string): Blueprint | undefined {
  const normalised = query.toLowerCase().trim();
  return BLUEPRINTS.find(
    (b) => b.id === normalised || b.id.startsWith(normalised + '-'),
  );
}

/** Return the slug portion used as a default directory name. */
export function blueprintSlug(blueprint: Blueprint): string {
  return blueprint.id;
}
