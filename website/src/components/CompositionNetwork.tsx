import { useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ALL_PATTERNS,
  COMPOSITIONS,
  type CompositionEdge,
  type CompositionKind,
  type PatternMeta,
} from '../data/patterns';

const BASE = (import.meta as { env: { BASE_URL?: string } }).env.BASE_URL || '/agent-blueprints';

const KIND_STYLE: Record<CompositionKind, { stroke: string; strokeDasharray?: string; label: string; description: string }> = {
  natural: {
    stroke: '#10B981',
    label: 'natural',
    description: 'Composes cleanly with no extra design work.',
  },
  useful: {
    stroke: '#3B82F6',
    label: 'useful',
    description: 'Composes with some integration effort.',
  },
  complex: {
    stroke: '#F59E0B',
    strokeDasharray: '6 3',
    label: 'complex',
    description: 'Composable, but state and control handoff need care.',
  },
  redundant: {
    stroke: '#EF4444',
    strokeDasharray: '2 3',
    label: 'redundant',
    description: 'Overlaps in responsibility. Pick one rather than both.',
  },
};

function cohortColor(p: PatternMeta): { bg: string; border: string; text: string } {
  switch (p.kind) {
    case 'primitive':
      return { bg: '#F0F9FF', border: '#7DD3FC', text: '#0C4A6E' };
    case 'modifier':
      return { bg: '#F5F3FF', border: '#C4B5FD', text: '#4C1D95' };
    default:
      // pattern; distinguish workflow (emerald) vs agent (amber)
      if (p.category === 'workflow') return { bg: '#ECFDF5', border: '#6EE7B7', text: '#064E3B' };
      return { bg: '#FFFBEB', border: '#FCD34D', text: '#78350F' };
  }
}

function entryHref(p: PatternMeta): string {
  if (p.kind === 'primitive') return `${BASE}/primitives/${p.slug}/`;
  if (p.kind === 'modifier') return `${BASE}/modifiers/${p.slug}/`;
  if (p.category === 'workflow') return `${BASE}/workflows/${p.slug}/`;
  return `${BASE}/patterns/${p.slug}/`;
}

/**
 * Place every entry on a circle, ordered by cohort so related entries cluster.
 * The order around the ring: workflows → agents → primitives → modifiers,
 * which puts conceptually adjacent cohorts side by side.
 */
function radialLayout(entries: PatternMeta[], radius: number, cx: number, cy: number) {
  const order = [...entries].sort((a, b) => {
    const rank = (p: PatternMeta) => {
      if (p.kind === 'modifier') return 3;
      if (p.kind === 'primitive') return 2;
      if (p.category === 'workflow') return 0;
      return 1;
    };
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
  const n = order.length;
  const pos: Record<string, { x: number; y: number }> = {};
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    pos[order[i].id] = {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  }
  return pos;
}

export default function CompositionNetwork() {
  const [selectedKinds, setSelectedKinds] = useState<Set<CompositionKind>>(
    new Set(['natural', 'useful', 'complex', 'redundant'] as CompositionKind[]),
  );
  const [hoveredEdge, setHoveredEdge] = useState<CompositionEdge | null>(null);

  const nodes: Node[] = useMemo(() => {
    const layout = radialLayout(ALL_PATTERNS, 280, 360, 320);
    const idsInEdges = new Set<string>();
    for (const c of COMPOSITIONS) {
      idsInEdges.add(c.a);
      idsInEdges.add(c.b);
    }
    return ALL_PATTERNS.filter((p) => idsInEdges.has(p.id)).map((p) => {
      const c = cohortColor(p);
      return {
        id: p.id,
        position: layout[p.id] || { x: 0, y: 0 },
        data: { label: p.name, href: entryHref(p) },
        style: {
          background: c.bg,
          border: `1.5px solid ${c.border}`,
          borderRadius: 10,
          padding: '8px 12px',
          fontSize: 12,
          fontWeight: 500,
          color: c.text,
          minWidth: 100,
          textAlign: 'center' as const,
          cursor: 'pointer',
        },
      };
    });
  }, []);

  const edges: Edge[] = useMemo(() => {
    return COMPOSITIONS.filter((c) => selectedKinds.has(c.kind)).map((c, i) => {
      const style = KIND_STYLE[c.kind];
      return {
        id: `${c.a}--${c.b}-${i}`,
        source: c.a,
        target: c.b,
        type: 'default',
        animated: false,
        markerEnd: { type: MarkerType.Arrow, color: style.stroke, width: 14, height: 14 },
        style: {
          stroke: style.stroke,
          strokeWidth: 1.5,
          strokeDasharray: style.strokeDasharray,
          opacity: 0.75,
        },
        data: c,
      };
    });
  }, [selectedKinds]);

  const toggleKind = (k: CompositionKind) => {
    setSelectedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  return (
    <div className="not-prose">
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="font-mono text-xs uppercase tracking-wider text-text-tertiary">Edges:</span>
        {(['natural', 'useful', 'complex', 'redundant'] as CompositionKind[]).map((k) => {
          const style = KIND_STYLE[k];
          const active = selectedKinds.has(k);
          return (
            <button
              key={k}
              onClick={() => toggleKind(k)}
              className={`flex items-center gap-2 px-3 py-1 rounded-md border text-xs font-mono transition-colors ${
                active
                  ? 'bg-bg border-surface-border text-text'
                  : 'bg-bg-alt border-surface-border text-text-tertiary'
              }`}
              title={style.description}
            >
              <span
                className="inline-block w-6 h-0.5"
                style={{
                  background: style.stroke,
                  borderTop: style.strokeDasharray ? `1.5px dashed ${style.stroke}` : undefined,
                  height: style.strokeDasharray ? 0 : 2,
                }}
              />
              {style.label}
            </button>
          );
        })}
      </div>

      <div
        className="relative w-full bg-bg-alt border border-surface-border rounded-xl overflow-hidden"
        style={{ height: 640 }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
          onNodeClick={(_, node) => {
            const href = (node.data as { href?: string }).href;
            if (href) window.location.href = href;
          }}
          onEdgeMouseEnter={(_, edge) => setHoveredEdge(edge.data as CompositionEdge)}
          onEdgeMouseLeave={() => setHoveredEdge(null)}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.4}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} size={1} color="#e5e7eb" />
          <Controls showInteractive={false} />
        </ReactFlow>

        {hoveredEdge && (
          <div className="absolute bottom-3 left-3 max-w-md bg-bg border border-surface-border rounded-lg shadow-card px-4 py-3 text-sm">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-block w-8 h-0.5"
                style={{
                  background: KIND_STYLE[hoveredEdge.kind].stroke,
                  borderTop: KIND_STYLE[hoveredEdge.kind].strokeDasharray ? `1.5px dashed ${KIND_STYLE[hoveredEdge.kind].stroke}` : undefined,
                  height: KIND_STYLE[hoveredEdge.kind].strokeDasharray ? 0 : 2,
                }}
              />
              <span className="text-xs font-mono text-text-tertiary uppercase tracking-wider">
                {hoveredEdge.kind}
              </span>
            </div>
            <div className="font-medium text-text">
              {hoveredEdge.a} ↔ {hoveredEdge.b}
            </div>
            <div className="text-text-secondary text-sm mt-0.5">{hoveredEdge.rationale}</div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-mono">
        <span className="text-text-tertiary uppercase tracking-wider">Cohorts:</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />workflows</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />agent patterns</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-sky-100 border border-sky-300" />primitives</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-violet-100 border border-violet-300" />modifiers</span>
      </div>

      <p className="mt-4 text-xs text-text-tertiary font-mono leading-relaxed">
        The edges come from <code className="text-text-secondary">patterns-catalog.yaml#compositions</code>. The catalog is authoritative — if the site is behind, trust the catalog.
      </p>
    </div>
  );
}
