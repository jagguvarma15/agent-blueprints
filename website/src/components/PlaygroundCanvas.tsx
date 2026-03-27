import { useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeChange,
  type EdgeChange,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { PlaygroundPattern, PlaygroundNode as PNode, NodeType } from '../data/playground';

// Icons per node type
const NODE_ICONS: Record<NodeType, string> = {
  llm: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2a2 2 0 012 2c0 1.1-.9 2-2 2s-2-.9-2-2a2 2 0 012-2z"/><path d="M12 18a2 2 0 012 2c0 1.1-.9 2-2 2s-2-.9-2-2a2 2 0 012-2z"/><path d="M4.22 4.22a2 2 0 012.83 0 2 2 0 010 2.83 2 2 0 01-2.83 0 2 2 0 010-2.83z"/><path d="M17 17a2 2 0 012.83 0 2 2 0 010 2.83 2 2 0 01-2.83 0 2 2 0 010-2.83z"/><circle cx="12" cy="12" r="3"/></svg>`,
  tool: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>`,
  storage: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
  processor: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,
  input: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`,
  output: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18l6-6-6-6"/></svg>`,
  gate: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12l2 2 4-4"/><path d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622C17.176 19.29 21 14.591 21 9a12.02 12.02 0 00-.382-3.016z"/></svg>`,
};

interface CustomNodeData extends Record<string, unknown> {
  label: string;
  type: NodeType;
  description: string;
  removable: boolean;
  disabled: boolean;
  cascadeDisabled: boolean;
  onToggle: (id: string) => void;
  onFocus: (id: string) => void;
}

function PlaygroundNodeComponent({ id, data }: { id: string; data: CustomNodeData }) {
  const { label, type, removable, disabled, cascadeDisabled, onToggle, onFocus } = data;
  const isDimmed = disabled || cascadeDisabled;

  const typeColors: Record<NodeType, string> = {
    llm: 'border-violet-300 bg-violet-50',
    tool: 'border-emerald-300 bg-emerald-50',
    storage: 'border-blue-300 bg-blue-50',
    processor: 'border-amber-300 bg-amber-50',
    input: 'border-accent/40 bg-accent-light',
    output: 'border-accent/40 bg-accent-light',
    gate: 'border-red-300 bg-red-50',
  };

  const baseClass = isDimmed
    ? 'border-dashed border-gray-300 bg-gray-50 opacity-40'
    : `border-solid ${typeColors[type] || 'border-surface-border bg-surface'}`;

  return (
    <div
      className={`
        relative px-3 py-2.5 rounded-xl border-2 shadow-node cursor-pointer
        min-w-[120px] max-w-[160px] transition-all duration-150
        hover:shadow-node-hover hover:scale-105
        ${baseClass}
      `}
      onClick={() => onFocus(id)}
      onDoubleClick={() => removable && onToggle(id)}
      title={removable ? 'Double-click to toggle' : 'Core node — cannot be removed'}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`flex-shrink-0 ${isDimmed ? 'text-gray-400' : 'text-text-secondary'}`}
          dangerouslySetInnerHTML={{ __html: NODE_ICONS[type] }}
        />
        <span className={`text-xs font-medium leading-tight ${isDimmed ? 'text-gray-400' : 'text-text'}`}>
          {label}
        </span>
      </div>
      {removable && !disabled && (
        <button
          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-200 hover:bg-red-200 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => { e.stopPropagation(); onToggle(id); }}
          title="Toggle node"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  playground: PlaygroundNodeComponent as any,
};

interface InfoState {
  type: 'default' | 'node-focused' | 'node-disabled';
  nodeId?: string;
  nodeData?: PNode;
}

interface PlaygroundCanvasProps {
  pattern: PlaygroundPattern;
}

export default function PlaygroundCanvas({ pattern }: PlaygroundCanvasProps) {
  const [disabledNodes, setDisabledNodes] = useState<Set<string>>(new Set());
  const [info, setInfo] = useState<InfoState>({ type: 'default' });
  // Track node positions (for drag support)
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});

  // Compute cascade-disabled nodes
  const cascadeDisabled = useMemo(() => {
    const cascade = new Set<string>();
    for (const node of pattern.nodes) {
      if (!node.dependsOn) continue;
      if (node.dependsOn.some((dep) => disabledNodes.has(dep))) {
        cascade.add(node.id);
      }
    }
    return cascade;
  }, [disabledNodes, pattern.nodes]);

  const handleToggle = useCallback(
    (id: string) => {
      const node = pattern.nodes.find((n) => n.id === id);
      if (!node?.removable) return;

      setDisabledNodes((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [pattern.nodes],
  );

  const handleFocus = useCallback(
    (id: string) => {
      const node = pattern.nodes.find((n) => n.id === id);
      if (!node) return;
      const isDisabled = disabledNodes.has(id) || cascadeDisabled.has(id);
      setInfo({
        type: isDisabled ? 'node-disabled' : 'node-focused',
        nodeId: id,
        nodeData: node,
      });
    },
    [pattern.nodes, disabledNodes, cascadeDisabled],
  );

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setNodePositions((prev) => {
      const next = { ...prev };
      for (const change of changes) {
        if (change.type === 'position' && 'position' in change && change.position) {
          next[change.id] = change.position;
        }
      }
      return next;
    });
  }, []);

  const rfNodes: Node[] = useMemo(
    () =>
      pattern.nodes.map((n) => ({
        id: n.id,
        type: 'playground',
        position: nodePositions[n.id] ?? n.position,
        data: {
          label: n.label,
          type: n.type,
          description: n.description,
          removable: n.removable,
          disabled: disabledNodes.has(n.id),
          cascadeDisabled: cascadeDisabled.has(n.id),
          onToggle: handleToggle,
          onFocus: handleFocus,
        } as CustomNodeData,
      })),
    [pattern.nodes, disabledNodes, cascadeDisabled, handleToggle, handleFocus, nodePositions],
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      pattern.edges.map((e) => {
        const srcDisabled = disabledNodes.has(e.source) || cascadeDisabled.has(e.source);
        const tgtDisabled = disabledNodes.has(e.target) || cascadeDisabled.has(e.target);
        const dim = srcDisabled || tgtDisabled;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
          animated: e.animated && !dim,
          style: {
            stroke: dim ? '#D1D5DB' : '#9CA3AF',
            strokeWidth: dim ? 1 : 1.5,
            strokeDasharray: dim ? '4 4' : undefined,
            opacity: dim ? 0.4 : 1,
          },
          labelStyle: {
            fill: dim ? '#D1D5DB' : '#6B7280',
            fontSize: 10,
            fontFamily: 'IBM Plex Mono, monospace',
          },
          markerEnd: dim
            ? undefined
            : { type: MarkerType.ArrowClosed, color: '#9CA3AF', width: 12, height: 12 },
        };
      }),
    [pattern.edges, disabledNodes, cascadeDisabled],
  );

  const handleEdgesChange = useCallback((_changes: EdgeChange[]) => {
    // edges are fully computed — no-op
  }, []);

  const handleReset = () => {
    setDisabledNodes(new Set());
    setNodePositions({});
    setInfo({ type: 'default' });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-0 h-[calc(100vh-12rem)] min-h-[500px]">
      {/* Canvas */}
      <div className="flex-1 rounded-xl border border-surface-border overflow-hidden bg-bg-alt relative">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          attributionPosition="bottom-left"
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#E7E5E4" gap={20} size={1} />
          <Controls className="!bg-bg !border-surface-border !shadow-card" />
          <MiniMap
            nodeColor={(n) => {
              const d = n.data as CustomNodeData;
              if (d.disabled || d.cascadeDisabled) return '#E5E7EB';
              const colors: Record<NodeType, string> = {
                llm: '#DDD6FE', tool: '#BBF7D0', storage: '#BFDBFE',
                processor: '#FDE68A', input: '#C7D2FE', output: '#C7D2FE', gate: '#FECACA',
              };
              return colors[d.type] || '#E5E7EB';
            }}
            className="!bg-bg !border-surface-border"
          />
        </ReactFlow>

        {/* Reset button */}
        <button
          onClick={handleReset}
          className="absolute top-3 right-3 px-3 py-1.5 bg-bg border border-surface-border rounded-lg text-xs text-text-secondary hover:text-text hover:bg-surface shadow-card transition-colors z-10 font-mono"
        >
          Reset
        </button>

        {/* Toggle hint */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-bg/90 border border-surface-border rounded-full text-2xs text-text-tertiary font-mono pointer-events-none">
          Double-click a node to toggle it
        </div>
      </div>

      {/* Info panel */}
      <InfoPanel info={info} pattern={pattern} disabledCount={disabledNodes.size} />
    </div>
  );
}

function InfoPanel({
  info,
  pattern,
  disabledCount,
}: {
  info: InfoState;
  pattern: PlaygroundPattern;
  disabledCount: number;
}) {
  return (
    <div className="lg:w-72 xl:w-80 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-surface-border bg-bg overflow-y-auto">
      <div className="p-5">
        {info.type === 'default' && (
          <DefaultPanel pattern={pattern} disabledCount={disabledCount} />
        )}
        {(info.type === 'node-focused' || info.type === 'node-disabled') && info.nodeData && (
          <NodePanel node={info.nodeData} disabled={info.type === 'node-disabled'} />
        )}
      </div>
    </div>
  );
}

function DefaultPanel({ pattern, disabledCount }: { pattern: PlaygroundPattern; disabledCount: number }) {
  return (
    <>
      <div className="mb-4">
        <span className={`text-2xs font-mono px-2 py-0.5 rounded-full border font-medium ${
          pattern.category === 'workflow'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          {pattern.category === 'workflow' ? 'Workflow' : 'Agent Pattern'}
        </span>
      </div>
      <h3 className="font-display font-bold text-lg tracking-display text-text mb-2">
        {pattern.name}
      </h3>
      <p className="text-sm text-text-secondary leading-relaxed mb-4">
        {pattern.description}
      </p>
      <div className="p-3 bg-bg-alt rounded-lg border border-surface-border mb-4">
        <p className="text-2xs font-semibold font-mono uppercase tracking-wider text-text-tertiary mb-1">
          When to use
        </p>
        <p className="text-xs text-text-secondary leading-relaxed">{pattern.whenToUse}</p>
      </div>
      <div className="flex items-center gap-2 text-2xs text-text-tertiary font-mono">
        <div className="w-2 h-2 rounded-full bg-accent-light border border-accent/30"></div>
        {disabledCount === 0
          ? 'Double-click nodes to explore their effects'
          : `${disabledCount} node${disabledCount > 1 ? 's' : ''} toggled off`}
      </div>
    </>
  );
}

function NodePanel({ node, disabled }: { node: PNode; disabled: boolean }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${disabled ? 'bg-gray-300' : 'bg-success'}`} />
        <span className="text-2xs font-mono text-text-tertiary uppercase tracking-wider">
          {disabled ? 'Node disabled' : 'Node selected'}
        </span>
      </div>

      <h3 className="font-display font-bold text-base tracking-display text-text mb-2">
        {node.label}
      </h3>

      <div className="inline-flex items-center gap-1.5 text-2xs font-mono text-text-tertiary bg-surface border border-surface-border px-2 py-0.5 rounded-md mb-4">
        <span dangerouslySetInnerHTML={{ __html: NODE_ICONS[node.type] }} />
        {node.type}
      </div>

      <p className="text-sm text-text-secondary leading-relaxed mb-4">
        {node.description}
      </p>

      {disabled && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
          <p className="text-2xs font-semibold font-mono uppercase tracking-wider text-red-600 mb-1">
            Effect of removing this
          </p>
          <p className="text-xs text-red-800 leading-relaxed">{node.onDisableEffect}</p>
          {node.degradesTo && (
            <p className="text-xs text-red-600 mt-2 font-mono">
              Degrades to: <strong>{node.degradesTo}</strong>
            </p>
          )}
        </div>
      )}

      {!node.removable && (
        <div className="flex items-center gap-2 text-2xs text-text-tertiary font-mono">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          Core node — cannot be toggled
        </div>
      )}
    </>
  );
}
