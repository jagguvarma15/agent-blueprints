export interface Blueprint {
  id: string;
  name: string;
  complexity: 'Beginner' | 'Intermediate' | 'Advanced';
  pattern: string;
  status: 'ready' | 'planned';
  description: string;
}

export const BLUEPRINTS: Blueprint[] = [
  {
    id: '01-react-agent',
    name: 'ReAct Agent',
    complexity: 'Beginner',
    pattern: 'Orchestration',
    status: 'ready',
    description: 'Orchestration blueprint (Beginner) ready to scaffold.',
  },
  {
    id: '02-plan-and-execute',
    name: 'Plan & Execute',
    complexity: 'Intermediate',
    pattern: 'Orchestration',
    status: 'planned',
    description: 'Planned Orchestration blueprint (not scaffoldable yet).',
  },
  {
    id: '03-reflexion',
    name: 'Reflexion',
    complexity: 'Intermediate',
    pattern: 'Orchestration',
    status: 'planned',
    description: 'Planned Orchestration blueprint (not scaffoldable yet).',
  },
  {
    id: '04-multi-agent-supervisor',
    name: 'Multi Agent Supervisor',
    complexity: 'Intermediate',
    pattern: 'Multi-agent',
    status: 'ready',
    description: 'Multi-agent blueprint (Intermediate) ready to scaffold.',
  },
  {
    id: '05-multi-agent-parallel',
    name: 'Multi Agent Parallel',
    complexity: 'Intermediate',
    pattern: 'Multi-agent',
    status: 'planned',
    description: 'Planned Multi-agent blueprint (not scaffoldable yet).',
  },
  {
    id: '06-memory-agent',
    name: 'Memory Agent',
    complexity: 'Intermediate',
    pattern: 'Memory',
    status: 'planned',
    description: 'Planned Memory blueprint (not scaffoldable yet).',
  },
  {
    id: '07-rag-basic',
    name: 'RAG Basic',
    complexity: 'Beginner',
    pattern: 'RAG',
    status: 'ready',
    description: 'RAG blueprint (Beginner) ready to scaffold.',
  },
  {
    id: '08-rag-advanced',
    name: 'RAG Advanced',
    complexity: 'Advanced',
    pattern: 'RAG',
    status: 'planned',
    description: 'Planned RAG blueprint (not scaffoldable yet).',
  },
  {
    id: '09-tool-calling',
    name: 'Tool Calling',
    complexity: 'Beginner',
    pattern: 'Tools',
    status: 'planned',
    description: 'Planned Tools blueprint (not scaffoldable yet).',
  },
  {
    id: '10-human-in-the-loop',
    name: 'Human in the Loop',
    complexity: 'Intermediate',
    pattern: 'Control flow',
    status: 'planned',
    description: 'Planned Control flow blueprint (not scaffoldable yet).',
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
