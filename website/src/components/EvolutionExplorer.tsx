import { useState, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  MarkerType,
  useNodesState,
  useEdgesState,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { PatternMeta } from '../data/patterns';

interface ExplorerProps {
  workflows: PatternMeta[];
  agentPatterns: PatternMeta[];
  evolutionEdges: { source: string; target: string }[];
  base: string;
}

interface ExplorerNodeData extends Record<string, unknown> {
  label: string;
  description: string;
  category: 'workflow' | 'agent';
  complexity: string;
  href: string;
  highlighted: boolean;
  dimmed: boolean;
}

function ExplorerNode({ id, data }: { id: string; data: ExplorerNodeData }) {
  const { label, description, category, complexity, highlighted, dimmed } = data;

  const isWorkflow = category === 'workflow';
  const activeStyle = isWorkflow
    ? 'border-emerald-400 bg-emerald-50 shadow-node-hover'
    : 'border-amber-400 bg-amber-50 shadow-node-hover';
  const defaultStyle = isWorkflow
    ? 'border-emerald-200 bg-white'
    : 'border-amber-200 bg-white';

  return (
    <div
      className={`
        px-4 py-3 rounded-xl border-2 shadow-node cursor-pointer
        min-w-[140px] max-w-[180px] transition-all duration-200
        ${dimmed ? 'opacity-20 scale-95' : 'opacity-100'}
        ${highlighted ? activeStyle : defaultStyle}
      `}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-1.5 h-1.5 rounded-full ${isWorkflow ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        <span className="text-2xs font-mono text-text-tertiary uppercase tracking-wider">
          {isWorkflow ? 'Workflow' : 'Agent'}
        </span>
      </div>
      <p className="text-sm font-display font-bold tracking-display text-text leading-tight mb-1">
        {label}
      </p>
      <p className="text-xs text-text-secondary leading-snug line-clamp-2">{description}</p>
    </div>
  );
}

const nodeTypes = { explorer: ExplorerNode as any };

export default function EvolutionExplorer({
  workflows,
  agentPatterns,
  evolutionEdges,
  base,
}: ExplorerProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<PatternMeta | null>(null);

  // Node positions
  const wfSpacing = 220;
  const agSpacing = 160;
  const wfY = 80;
  const agY = 320;

  const wfStartX = 80;
  const agStartX = 40;

  const allNodes: Node[] = useMemo(() => {
    const allPatterns = [...workflows, ...agentPatterns];
    return [
      ...workflows.map((w, i) => ({
        id: w.id,
        type: 'explorer',
        position: { x: wfStartX + i * wfSpacing, y: wfY },
        data: {
          label: w.name,
          description: w.description,
          category: 'workflow' as const,
          complexity: w.complexity,
          href: `${base}/workflows/${w.slug}/`,
          highlighted: hoveredId
            ? hoveredId === w.id ||
              evolutionEdges.some((e) => e.source === w.id && e.target === hoveredId) ||
              evolutionEdges.some((e) => e.target === w.id && e.source === hoveredId)
            : false,
          dimmed: hoveredId
            ? hoveredId !== w.id &&
              !evolutionEdges.some((e) => e.source === w.id && e.target === hoveredId) &&
              !evolutionEdges.some((e) => e.target === w.id && e.source === hoveredId)
            : false,
        } as ExplorerNodeData,
      })),
      ...agentPatterns.map((ap, i) => ({
        id: ap.id,
        type: 'explorer',
        position: { x: agStartX + i * agSpacing, y: agY },
        data: {
          label: ap.name,
          description: ap.description,
          category: 'agent' as const,
          complexity: ap.complexity,
          href: `${base}/patterns/${ap.slug}/`,
          highlighted: hoveredId
            ? hoveredId === ap.id ||
              evolutionEdges.some((e) => e.target === ap.id && e.source === hoveredId) ||
              evolutionEdges.some((e) => e.source === ap.id && e.target === hoveredId)
            : false,
          dimmed: hoveredId
            ? hoveredId !== ap.id &&
              !evolutionEdges.some((e) => e.target === ap.id && e.source === hoveredId) &&
              !evolutionEdges.some((e) => e.source === ap.id && e.target === hoveredId)
            : false,
        } as ExplorerNodeData,
      })),
    ];
  }, [workflows, agentPatterns, evolutionEdges, hoveredId, base]);

  const allEdges: Edge[] = useMemo(
    () =>
      evolutionEdges.map((e, i) => {
        const isHighlighted = hoveredId
          ? e.source === hoveredId || e.target === hoveredId
          : false;
        return {
          id: `e-${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          animated: isHighlighted,
          style: {
            stroke: isHighlighted ? '#4F46E5' : '#D1D5DB',
            strokeWidth: isHighlighted ? 2 : 1,
            opacity: hoveredId && !isHighlighted ? 0.1 : 0.6,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isHighlighted ? '#4F46E5' : '#D1D5DB',
            width: 10,
            height: 10,
          },
        };
      }),
    [evolutionEdges, hoveredId],
  );

  const onNodeMouseEnter: NodeMouseHandler = useCallback((_, node) => {
    setHoveredId(node.id);
  }, []);

  const onNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setHoveredId(null);
  }, []);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      const pattern = [...workflows, ...agentPatterns].find((p) => p.id === node.id);
      if (pattern) setSelectedPattern(pattern);
    },
    [workflows, agentPatterns],
  );

  return (
    <div className="space-y-6">
      {/* React Flow visualization */}
      <div className="h-[500px] rounded-xl border border-surface-border overflow-hidden bg-bg-alt relative">
        <ReactFlow
          nodes={allNodes}
          edges={allEdges}
          nodeTypes={nodeTypes}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        >
          <Background color="#E7E5E4" gap={20} size={1} />
        </ReactFlow>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 flex items-center gap-4 bg-bg/90 border border-surface-border rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <div className="w-3 h-3 rounded border-2 border-emerald-300 bg-emerald-50" />
            Workflow
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <div className="w-3 h-3 rounded border-2 border-amber-300 bg-amber-50" />
            Agent Pattern
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-tertiary font-mono">
            Hover to highlight · Click for details
          </div>
        </div>
      </div>

      {/* Selected pattern card */}
      {selectedPattern && (
        <div className="bg-bg border border-surface-border rounded-xl p-5 flex items-start justify-between gap-4 animate-fade-up">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-2xs font-mono px-2 py-0.5 rounded-full border font-medium ${
                selectedPattern.category === 'workflow'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {selectedPattern.category === 'workflow' ? 'Workflow' : 'Agent Pattern'}
              </span>
            </div>
            <h3 className="font-display font-bold text-lg tracking-display text-text mb-1">
              {selectedPattern.name}
            </h3>
            <p className="text-sm text-text-secondary">{selectedPattern.description}</p>
            {selectedPattern.evolvesFrom && selectedPattern.evolvesFrom.length > 0 && (
              <p className="text-xs text-text-tertiary font-mono mt-2">
                Evolves from: {selectedPattern.evolvesFrom.join(' + ')}
              </p>
            )}
          </div>
          <a
            href={`${base}/${selectedPattern.category === 'workflow' ? 'workflows' : 'patterns'}/${selectedPattern.slug}/`}
            className="flex-shrink-0 px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover transition-colors"
          >
            View Pattern →
          </a>
        </div>
      )}

      {/* Evolution matrix table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-bg-alt">
              <th className="text-left px-4 py-3 font-semibold text-text border border-surface-border">Workflow</th>
              <th className="text-left px-4 py-3 font-semibold text-text border border-surface-border">Evolves Into</th>
              <th className="text-left px-4 py-3 font-semibold text-text border border-surface-border">What Gets Added</th>
            </tr>
          </thead>
          <tbody>
            {workflows.map((wf) => {
              const children = agentPatterns.filter(
                (ap) => ap.evolvesFrom?.includes(wf.id),
              );
              return children.map((ap, i) => (
                <tr key={`${wf.id}-${ap.id}`} className="hover:bg-bg-alt transition-colors">
                  {i === 0 && (
                    <td
                      rowSpan={children.length}
                      className="px-4 py-3 border border-surface-border align-top"
                    >
                      <a href={`${base}/workflows/${wf.slug}/`} className="font-medium text-text hover:text-accent transition-colors">
                        {wf.name}
                      </a>
                    </td>
                  )}
                  <td className="px-4 py-3 border border-surface-border">
                    <a href={`${base}/patterns/${ap.slug}/`} className="text-accent hover:text-accent-hover transition-colors font-medium">
                      {ap.name}
                    </a>
                  </td>
                  <td className="px-4 py-3 border border-surface-border text-text-secondary">
                    {getEvolutionNote(wf.id, ap.id)}
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getEvolutionNote(workflowId: string, patternId: string): string {
  const notes: Record<string, string> = {
    'prompt-chaining-react': 'Dynamic tool selection + LLM-controlled looping replaces hardcoded steps',
    'prompt-chaining-tool-use': 'Structured function schemas + dispatcher replaces manual output parsing',
    'prompt-chaining-memory': 'Persistent state store + retrieval replaces ephemeral context',
    'parallel-calls-rag': 'Vector search retrieval replaces static parallel splits',
    'parallel-calls-routing': 'LLM intent classification replaces hardcoded branch logic',
    'orchestrator-worker-plan-and-execute': 'LLM plans full sequence upfront vs. dynamic decomposition',
    'orchestrator-worker-multi-agent': 'Workers become autonomous agents with their own tools & memory',
    'routing-multi-agent': 'Routed handlers become full agents instead of single LLM calls',
    'evaluator-optimizer-reflection': 'Evaluator becomes the LLM itself via self-critique prompting',
  };
  return notes[`${workflowId}-${patternId}`] || '—';
}
