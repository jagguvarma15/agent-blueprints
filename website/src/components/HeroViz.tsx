import { useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  MarkerType,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const WF_NODES = [
  { id: 'pc', label: 'Prompt\nChaining', x: 60, y: 60 },
  { id: 'par', label: 'Parallel\nCalls', x: 220, y: 60 },
  { id: 'ow', label: 'Orchestrator\nWorker', x: 380, y: 60 },
  { id: 'eo', label: 'Evaluator\nOptimizer', x: 540, y: 60 },
];

const AG_NODES = [
  { id: 'react', label: 'ReAct', x: 20, y: 220 },
  { id: 'tu', label: 'Tool Use', x: 130, y: 220 },
  { id: 'mem', label: 'Memory', x: 240, y: 220 },
  { id: 'rag', label: 'RAG', x: 330, y: 220 },
  { id: 'rot', label: 'Routing', x: 420, y: 220 },
  { id: 'pe', label: 'Plan &\nExecute', x: 510, y: 220 },
  { id: 'ref', label: 'Reflection', x: 610, y: 220 },
  { id: 'ma', label: 'Multi\nAgent', x: 700, y: 220 },
];

const EVOLVE_EDGES = [
  { s: 'pc', t: 'react' }, { s: 'pc', t: 'tu' }, { s: 'pc', t: 'mem' },
  { s: 'par', t: 'rag' }, { s: 'par', t: 'rot' },
  { s: 'ow', t: 'pe' }, { s: 'ow', t: 'ma' },
  { s: 'rot', t: 'ma' }, { s: 'eo', t: 'ref' },
];

function buildNodes(animPhase: number): Node[] {
  return [
    ...WF_NODES.map((n, i) => ({
      id: n.id,
      position: { x: n.x, y: n.y },
      data: { label: n.label, type: 'wf' },
      type: 'mini',
      style: {
        opacity: animPhase >= i ? 1 : 0,
        transition: 'opacity 400ms ease',
      },
    })),
    ...AG_NODES.map((n, i) => ({
      id: n.id,
      position: { x: n.x, y: n.y },
      data: { label: n.label, type: 'ag' },
      type: 'mini',
      style: {
        opacity: animPhase >= WF_NODES.length + i ? 1 : 0,
        transition: 'opacity 400ms ease',
      },
    })),
  ];
}

function buildEdges(animPhase: number): Edge[] {
  return EVOLVE_EDGES.map((e, i) => ({
    id: `e-${e.s}-${e.t}`,
    source: e.s,
    target: e.t,
    animated: true,
    style: {
      stroke: '#4F46E5',
      strokeWidth: 1,
      opacity: animPhase >= WF_NODES.length + AG_NODES.length + i ? 0.4 : 0,
      transition: 'opacity 300ms ease',
    },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#4F46E5', width: 8, height: 8 },
  }));
}

function MiniNode({ data }: { data: { label: string; type: 'wf' | 'ag' } }) {
  const isWf = data.type === 'wf';
  return (
    <div className={`
      px-2 py-1.5 rounded-lg border text-center transition-all
      ${isWf
        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
        : 'border-amber-300 bg-amber-50 text-amber-800'
      }
    `}
    style={{ minWidth: 80 }}
    >
      <span className="text-xs font-display font-bold leading-tight whitespace-pre-line" style={{ fontSize: 10 }}>
        {data.label}
      </span>
    </div>
  );
}

const nodeTypes = { mini: MiniNode as any };

export default function HeroViz() {
  const [animPhase, setAnimPhase] = useState(0);
  const total = WF_NODES.length + AG_NODES.length + EVOLVE_EDGES.length;

  useEffect(() => {
    if (animPhase >= total) return;
    const timeout = setTimeout(() => setAnimPhase((p) => p + 1), 150);
    return () => clearTimeout(timeout);
  }, [animPhase, total]);

  const nodes = buildNodes(animPhase);
  const edges = buildEdges(animPhase);

  return (
    <div className="w-full h-full rounded-2xl border border-surface-border overflow-hidden bg-bg-alt">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        preventScrolling={false}
      >
        <Background color="#E7E5E4" gap={20} size={1} />
      </ReactFlow>

      {/* Labels */}
      <div className="absolute top-3 left-3 flex flex-col gap-1 pointer-events-none">
        <div className="flex items-center gap-1.5 text-2xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5 font-mono">
          ↑ Workflows
        </div>
        <div className="flex items-center gap-1.5 text-2xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 font-mono">
          ↓ Agent Patterns
        </div>
      </div>
    </div>
  );
}
