/**
 * Pattern metadata for the website.
 *
 * Each pattern's authoritative machine-readable metadata lives in:
 *   workflows/{id}/metadata.json
 *   patterns/{id}/metadata.json
 *
 * The data in this file mirrors those JSON files. If you add a new pattern,
 * update both the JSON file in the repo and the arrays below.
 */

export type Complexity = 'Beginner' | 'Intermediate' | 'Advanced';
export type Category = 'workflow' | 'agent';

export interface PatternMeta {
  id: string;
  name: string;
  slug: string;
  description: string;
  complexity: Complexity;
  category: Category;
  /** For agent patterns: the workflow(s) this evolves from */
  evolvesFrom?: string[];
  /** Agent patterns that evolve FROM this workflow (for workflow patterns) */
  evolvesInto?: string[];
}

export const WORKFLOWS: PatternMeta[] = [
  {
    id: 'prompt-chaining',
    name: 'Prompt Chaining',
    slug: 'prompt-chaining',
    description: 'Sequential LLM calls with validation gates between steps.',
    complexity: 'Beginner',
    category: 'workflow',
    evolvesInto: ['react', 'tool-use', 'memory'],
  },
  {
    id: 'parallel-calls',
    name: 'Parallel Calls',
    slug: 'parallel-calls',
    description: 'Concurrent LLM calls on independent inputs, aggregated at the end.',
    complexity: 'Beginner',
    category: 'workflow',
    evolvesInto: ['rag', 'routing'],
  },
  {
    id: 'orchestrator-worker',
    name: 'Orchestrator-Worker',
    slug: 'orchestrator-worker',
    description: 'LLM decomposes a task and delegates to specialized workers.',
    complexity: 'Intermediate',
    category: 'workflow',
    evolvesInto: ['plan-and-execute', 'multi-agent'],
  },
  {
    id: 'evaluator-optimizer',
    name: 'Evaluator-Optimizer',
    slug: 'evaluator-optimizer',
    description: 'Generate-evaluate feedback loop that iteratively improves output.',
    complexity: 'Intermediate',
    category: 'workflow',
    evolvesInto: ['reflection'],
  },
];

export const AGENT_PATTERNS: PatternMeta[] = [
  {
    id: 'react',
    name: 'ReAct',
    slug: 'react',
    description: 'Reason-act loop: the LLM reasons, calls a tool, observes, and repeats until done.',
    complexity: 'Intermediate',
    category: 'agent',
    evolvesFrom: ['prompt-chaining'],
  },
  {
    id: 'plan-and-execute',
    name: 'Plan & Execute',
    slug: 'plan-and-execute',
    description: 'LLM creates a full plan upfront, then executes each step sequentially.',
    complexity: 'Intermediate',
    category: 'agent',
    evolvesFrom: ['orchestrator-worker'],
  },
  {
    id: 'tool-use',
    name: 'Tool Use',
    slug: 'tool-use',
    description: 'Structured function calling with schema-validated tool dispatch.',
    complexity: 'Beginner',
    category: 'agent',
    evolvesFrom: ['prompt-chaining'],
  },
  {
    id: 'memory',
    name: 'Memory',
    slug: 'memory',
    description: 'Persistent state across sessions: short-term, long-term, and semantic memory.',
    complexity: 'Intermediate',
    category: 'agent',
    evolvesFrom: ['prompt-chaining'],
  },
  {
    id: 'rag',
    name: 'RAG',
    slug: 'rag',
    description: 'Retrieval-augmented generation: retrieve relevant context before generating.',
    complexity: 'Intermediate',
    category: 'agent',
    evolvesFrom: ['parallel-calls'],
  },
  {
    id: 'reflection',
    name: 'Reflection',
    slug: 'reflection',
    description: 'LLM critiques its own output and self-improves through structured feedback.',
    complexity: 'Intermediate',
    category: 'agent',
    evolvesFrom: ['evaluator-optimizer'],
  },
  {
    id: 'routing',
    name: 'Routing',
    slug: 'routing',
    description: 'Intent classification dispatches inputs to specialized handlers.',
    complexity: 'Beginner',
    category: 'agent',
    evolvesFrom: ['parallel-calls'],
  },
  {
    id: 'multi-agent',
    name: 'Multi-Agent',
    slug: 'multi-agent',
    description: 'Supervisor-worker delegation across multiple autonomous agents.',
    complexity: 'Advanced',
    category: 'agent',
    evolvesFrom: ['orchestrator-worker', 'routing'],
  },
];

export const ALL_PATTERNS: PatternMeta[] = [...WORKFLOWS, ...AGENT_PATTERNS];

export function getPatternById(id: string): PatternMeta | undefined {
  return ALL_PATTERNS.find((p) => p.id === id);
}

export function getWorkflowById(id: string): PatternMeta | undefined {
  return WORKFLOWS.find((p) => p.id === id);
}

export function getAgentPatternById(id: string): PatternMeta | undefined {
  return AGENT_PATTERNS.find((p) => p.id === id);
}

/** Evolution edges: workflow → agent patterns */
export const EVOLUTION_EDGES = AGENT_PATTERNS.flatMap((ap) =>
  (ap.evolvesFrom ?? []).map((wfId) => ({ source: wfId, target: ap.id })),
);

/** Comparison data for /compare/ */
export interface PatternComparison {
  id: string;
  name: string;
  category: Category;
  complexity: Complexity;
  latency: 'Low' | 'Medium' | 'High' | 'Variable';
  cost: 'Low' | 'Medium' | 'High' | 'Variable';
  bestFor: string;
  requires: string[];
  composableWith: string[];
}

export const PATTERN_COMPARISONS: PatternComparison[] = [
  {
    id: 'prompt-chaining',
    name: 'Prompt Chaining',
    category: 'workflow',
    complexity: 'Beginner',
    latency: 'Medium',
    cost: 'Low',
    bestFor: 'Sequential, predictable transformations',
    requires: [],
    composableWith: ['parallel-calls', 'evaluator-optimizer'],
  },
  {
    id: 'parallel-calls',
    name: 'Parallel Calls',
    category: 'workflow',
    complexity: 'Beginner',
    latency: 'Low',
    cost: 'Medium',
    bestFor: 'Independent sub-tasks, aggregated results',
    requires: [],
    composableWith: ['prompt-chaining', 'orchestrator-worker'],
  },
  {
    id: 'orchestrator-worker',
    name: 'Orchestrator-Worker',
    category: 'workflow',
    complexity: 'Intermediate',
    latency: 'Medium',
    cost: 'Medium',
    bestFor: 'Complex tasks with dynamic decomposition',
    requires: [],
    composableWith: ['parallel-calls', 'evaluator-optimizer'],
  },
  {
    id: 'evaluator-optimizer',
    name: 'Evaluator-Optimizer',
    category: 'workflow',
    complexity: 'Intermediate',
    latency: 'High',
    cost: 'High',
    bestFor: 'Quality-sensitive outputs needing iteration',
    requires: [],
    composableWith: ['prompt-chaining', 'rag'],
  },
  {
    id: 'react',
    name: 'ReAct',
    category: 'agent',
    complexity: 'Intermediate',
    latency: 'Variable',
    cost: 'Medium',
    bestFor: 'Open-ended tasks requiring tool use',
    requires: ['tools'],
    composableWith: ['memory', 'reflection'],
  },
  {
    id: 'plan-and-execute',
    name: 'Plan & Execute',
    category: 'agent',
    complexity: 'Intermediate',
    latency: 'High',
    cost: 'High',
    bestFor: 'Complex multi-step tasks needing upfront planning',
    requires: ['tools'],
    composableWith: ['react', 'multi-agent'],
  },
  {
    id: 'tool-use',
    name: 'Tool Use',
    category: 'agent',
    complexity: 'Beginner',
    latency: 'Low',
    cost: 'Low',
    bestFor: 'Structured API calls and function execution',
    requires: ['tools'],
    composableWith: ['react', 'rag', 'routing'],
  },
  {
    id: 'memory',
    name: 'Memory',
    category: 'agent',
    complexity: 'Intermediate',
    latency: 'Medium',
    cost: 'Medium',
    bestFor: 'Sessions requiring context persistence',
    requires: ['storage'],
    composableWith: ['react', 'rag', 'multi-agent'],
  },
  {
    id: 'rag',
    name: 'RAG',
    category: 'agent',
    complexity: 'Intermediate',
    latency: 'Medium',
    cost: 'Medium',
    bestFor: 'Knowledge-intensive Q&A and generation',
    requires: ['retrieval', 'vector-store'],
    composableWith: ['react', 'routing', 'reflection'],
  },
  {
    id: 'reflection',
    name: 'Reflection',
    category: 'agent',
    complexity: 'Intermediate',
    latency: 'High',
    cost: 'High',
    bestFor: 'High-quality outputs needing self-critique',
    requires: [],
    composableWith: ['react', 'rag', 'plan-and-execute'],
  },
  {
    id: 'routing',
    name: 'Routing',
    category: 'agent',
    complexity: 'Beginner',
    latency: 'Low',
    cost: 'Low',
    bestFor: 'Multi-intent systems with specialized handlers',
    requires: [],
    composableWith: ['react', 'rag', 'multi-agent'],
  },
  {
    id: 'multi-agent',
    name: 'Multi-Agent',
    category: 'agent',
    complexity: 'Advanced',
    latency: 'High',
    cost: 'High',
    bestFor: 'Enterprise systems with parallel specialization',
    requires: ['tools', 'orchestration'],
    composableWith: ['react', 'routing', 'memory'],
  },
];
