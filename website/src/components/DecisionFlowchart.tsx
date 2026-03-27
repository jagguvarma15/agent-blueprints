import { useState } from 'react';

interface Decision {
  id: string;
  question: string;
  yes: string; // next node id or recommendation id
  no: string;
}

interface Recommendation {
  id: string;
  patterns: string[];
  description: string;
  href: string;
}

const DECISIONS: Decision[] = [
  {
    id: 'q1',
    question: 'Does the task require multiple distinct LLM steps?',
    yes: 'q2',
    no: 'r-single',
  },
  {
    id: 'q2',
    question: 'Are the steps independent of each other (no data dependency)?',
    yes: 'q3',
    no: 'q4',
  },
  {
    id: 'q3',
    question: 'Does the system need to classify inputs and route to specialists?',
    yes: 'r-routing',
    no: 'q5',
  },
  {
    id: 'q4',
    question: 'Does the LLM need to decide what to do at runtime?',
    yes: 'q6',
    no: 'q7',
  },
  {
    id: 'q5',
    question: 'Does the task need to retrieve external knowledge?',
    yes: 'r-rag',
    no: 'r-parallel',
  },
  {
    id: 'q6',
    question: 'Does the task need a full plan before execution?',
    yes: 'r-plan-execute',
    no: 'q8',
  },
  {
    id: 'q7',
    question: 'Does the output need iterative quality improvement?',
    yes: 'r-eval-opt',
    no: 'r-chaining',
  },
  {
    id: 'q8',
    question: 'Does the task need persistent memory across sessions?',
    yes: 'r-memory',
    no: 'q9',
  },
  {
    id: 'q9',
    question: 'Does the task need multiple specialist agents working in parallel?',
    yes: 'r-multi-agent',
    no: 'r-react',
  },
];

const RECOMMENDATIONS: Record<string, Recommendation> = {
  'r-single': {
    id: 'r-single',
    patterns: ['Prompt Chaining (1 step)', 'Tool Use'],
    description: 'A single well-crafted prompt or a simple tool call is sufficient. Start minimal.',
    href: 'tool-use',
  },
  'r-routing': {
    id: 'r-routing',
    patterns: ['Routing'],
    description: 'Use a Routing pattern to classify intent and dispatch to specialized handlers.',
    href: 'routing',
  },
  'r-rag': {
    id: 'r-rag',
    patterns: ['RAG', 'Parallel Calls'],
    description: 'Use RAG to retrieve relevant context. Combine with Parallel Calls for multi-source retrieval.',
    href: 'rag',
  },
  'r-parallel': {
    id: 'r-parallel',
    patterns: ['Parallel Calls'],
    description: 'Run multiple independent LLM calls in parallel and aggregate results.',
    href: 'parallel-calls',
  },
  'r-plan-execute': {
    id: 'r-plan-execute',
    patterns: ['Plan & Execute'],
    description: 'Plan all steps upfront, then execute sequentially. Great for complex, multi-stage tasks.',
    href: 'plan-and-execute',
  },
  'r-eval-opt': {
    id: 'r-eval-opt',
    patterns: ['Evaluator-Optimizer', 'Reflection'],
    description:
      'Use Evaluator-Optimizer for workflow-level quality loops, or Reflection for agent-level self-critique.',
    href: 'evaluator-optimizer',
  },
  'r-chaining': {
    id: 'r-chaining',
    patterns: ['Prompt Chaining'],
    description: 'Connect LLM calls sequentially with validation gates between each step.',
    href: 'prompt-chaining',
  },
  'r-memory': {
    id: 'r-memory',
    patterns: ['Memory', 'ReAct + Memory'],
    description: 'Add a Memory layer to persist context across sessions. Combine with ReAct for full agency.',
    href: 'memory',
  },
  'r-multi-agent': {
    id: 'r-multi-agent',
    patterns: ['Multi-Agent'],
    description: 'A supervisor delegates to specialized sub-agents working in parallel.',
    href: 'multi-agent',
  },
  'r-react': {
    id: 'r-react',
    patterns: ['ReAct'],
    description: 'The foundational agent pattern: think, act, observe. Handles open-ended tool-use tasks.',
    href: 'react',
  },
};

type NodeId = string;

export default function DecisionFlowchart({ base }: { base: string }) {
  const [path, setPath] = useState<NodeId[]>(['q1']);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});

  const currentId = path[path.length - 1];
  const isDecision = currentId.startsWith('q');
  const currentDecision = isDecision ? DECISIONS.find((d) => d.id === currentId) : null;
  const recommendation = !isDecision ? RECOMMENDATIONS[currentId] : null;

  function answer(questionId: string, yes: boolean) {
    const decision = DECISIONS.find((d) => d.id === questionId);
    if (!decision) return;
    const next = yes ? decision.yes : decision.no;
    setAnswers((prev) => ({ ...prev, [questionId]: yes }));
    setPath((prev) => [...prev, next]);
  }

  function restart() {
    setPath(['q1']);
    setAnswers({});
  }

  function goBack() {
    if (path.length <= 1) return;
    const prev = path[path.length - 2];
    // Remove the answer for the question we're going back to
    const questionId = prev.startsWith('q') ? prev : null;
    setPath((p) => p.slice(0, -1));
    if (questionId) {
      setAnswers((a) => {
        const next = { ...a };
        delete next[questionId];
        return next;
      });
    }
  }

  const isWorkflow = (id: string) =>
    ['prompt-chaining', 'parallel-calls', 'orchestrator-worker', 'evaluator-optimizer'].includes(id);

  return (
    <div className="max-w-2xl">
      {/* Progress breadcrumb */}
      {path.length > 1 && (
        <div className="flex items-center gap-1 mb-6 flex-wrap">
          {path.slice(0, -1).map((id, i) => {
            const d = DECISIONS.find((q) => q.id === id);
            if (!d) return null;
            const answered = answers[id];
            return (
              <span key={id} className="flex items-center gap-1 text-xs text-text-tertiary font-mono">
                {i > 0 && <span>→</span>}
                <span className={`px-2 py-0.5 rounded ${answered ? 'bg-accent-light text-accent' : 'bg-surface text-text-secondary'}`}>
                  {answered === true ? 'Yes' : 'No'}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Current question */}
      {currentDecision && (
        <div className="bg-bg border border-surface-border rounded-2xl p-6 shadow-card animate-fade-up">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
              {path.length}
            </div>
            <span className="text-xs font-mono text-text-tertiary uppercase tracking-wider">Question</span>
          </div>

          <p className="text-lg font-display font-bold tracking-display text-text mb-6 leading-snug">
            {currentDecision.question}
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => answer(currentDecision.id, true)}
              className="flex-1 py-3 px-4 bg-accent text-white rounded-xl font-medium hover:bg-accent-hover transition-colors text-sm"
            >
              Yes →
            </button>
            <button
              onClick={() => answer(currentDecision.id, false)}
              className="flex-1 py-3 px-4 bg-bg border border-surface-border rounded-xl font-medium text-text-secondary hover:text-text hover:bg-surface transition-colors text-sm"
            >
              No →
            </button>
          </div>
        </div>
      )}

      {/* Recommendation */}
      {recommendation && (
        <div className="bg-bg border-2 border-accent/20 rounded-2xl p-6 shadow-card animate-fade-up">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-success text-white flex items-center justify-center flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <span className="text-xs font-mono text-success uppercase tracking-wider font-semibold">Recommendation</span>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {recommendation.patterns.map((name) => (
              <span key={name} className="text-sm font-display font-bold tracking-display bg-accent-light text-accent px-3 py-1 rounded-lg">
                {name}
              </span>
            ))}
          </div>

          <p className="text-sm text-text-secondary leading-relaxed mb-5">
            {recommendation.description}
          </p>

          <div className="flex items-center gap-3">
            <a
              href={`${base}/${isWorkflow(recommendation.href) ? 'workflows' : 'patterns'}/${recommendation.href}/`}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover transition-colors"
            >
              View Pattern →
            </a>
            <button
              onClick={restart}
              className="px-4 py-2 text-sm text-text-secondary border border-surface-border rounded-lg hover:bg-surface transition-colors"
            >
              Start over
            </button>
          </div>
        </div>
      )}

      {/* Back/restart controls */}
      {path.length > 1 && !recommendation && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={goBack}
            className="text-sm text-text-secondary hover:text-text flex items-center gap-1 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Back
          </button>
          <button
            onClick={restart}
            className="text-sm text-text-secondary hover:text-text transition-colors"
          >
            Start over
          </button>
        </div>
      )}
    </div>
  );
}
