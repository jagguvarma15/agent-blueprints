import { useMemo, useState } from 'react';
import {
  PATTERN_COMPARISONS,
  ALL_PATTERNS,
  type PatternComparison,
  type PatternMeta,
} from '../data/patterns';

const BASE = (import.meta as { env: { BASE_URL?: string } }).env.BASE_URL || '/agent-blueprints';

const LATENCY_ORDER = ['Low', 'Medium', 'High', 'Variable'] as const;
const COST_ORDER = ['Low', 'Medium', 'High', 'Variable'] as const;
type Tier = (typeof LATENCY_ORDER)[number];

function complexityRadius(c: string): number {
  if (c === 'Beginner') return 11;
  if (c === 'Advanced') return 18;
  return 14;
}

function cohortFill(p: PatternMeta): { bg: string; border: string; text: string } {
  switch (p.kind) {
    case 'primitive':
      return { bg: '#BAE6FD', border: '#0284C7', text: '#0C4A6E' };
    case 'modifier':
      return { bg: '#DDD6FE', border: '#7C3AED', text: '#4C1D95' };
    default:
      if (p.category === 'workflow') return { bg: '#A7F3D0', border: '#059669', text: '#064E3B' };
      return { bg: '#FDE68A', border: '#D97706', text: '#78350F' };
  }
}

function entryHref(p: PatternMeta): string {
  if (p.kind === 'primitive') return `${BASE}/primitives/${p.slug}/`;
  if (p.kind === 'modifier') return `${BASE}/modifiers/${p.slug}/`;
  if (p.category === 'workflow') return `${BASE}/workflows/${p.slug}/`;
  return `${BASE}/patterns/${p.slug}/`;
}

interface Placement {
  cmp: PatternComparison;
  meta: PatternMeta;
  cx: number;
  cy: number;
  r: number;
}

const WIDTH = 760;
const HEIGHT = 520;
const PAD_LEFT = 100;
const PAD_RIGHT = 30;
const PAD_TOP = 60;
const PAD_BOTTOM = 80;
const GRID_W = WIDTH - PAD_LEFT - PAD_RIGHT;
const GRID_H = HEIGHT - PAD_TOP - PAD_BOTTOM;
const CELL_W = GRID_W / LATENCY_ORDER.length;
const CELL_H = GRID_H / COST_ORDER.length;

export default function CostLatencyMatrix() {
  const [hovered, setHovered] = useState<Placement | null>(null);

  const placements: Placement[] = useMemo(() => {
    const metaById = new Map(ALL_PATTERNS.map((p) => [p.id, p]));
    const byCell = new Map<string, PatternComparison[]>();
    for (const cmp of PATTERN_COMPARISONS) {
      const key = `${cmp.latency}|${cmp.cost}`;
      if (!byCell.has(key)) byCell.set(key, []);
      byCell.get(key)!.push(cmp);
    }
    const out: Placement[] = [];
    for (const [key, entries] of byCell.entries()) {
      const [latency, cost] = key.split('|') as [Tier, Tier];
      const xIdx = LATENCY_ORDER.indexOf(latency);
      const yIdx = COST_ORDER.indexOf(cost);
      if (xIdx < 0 || yIdx < 0) continue;
      const cellX = PAD_LEFT + xIdx * CELL_W;
      const cellY = PAD_TOP + (COST_ORDER.length - 1 - yIdx) * CELL_H;
      // Distribute entries within the cell in a 3-column grid.
      const cols = Math.min(3, entries.length);
      const rows = Math.ceil(entries.length / cols);
      const slotW = CELL_W / cols;
      const slotH = CELL_H / Math.max(rows, 1);
      entries.forEach((cmp, i) => {
        const meta = metaById.get(cmp.id);
        if (!meta) return;
        const col = i % cols;
        const row = Math.floor(i / cols);
        out.push({
          cmp,
          meta,
          cx: cellX + slotW * (col + 0.5),
          cy: cellY + slotH * (row + 0.5),
          r: complexityRadius(cmp.complexity),
        });
      });
    }
    return out;
  }, []);

  const QUADRANTS = [
    { label: 'Sweet spot', sub: 'Low cost · low latency', xCell: 0, yCell: 0 },
    { label: 'Batch friendly', sub: 'Low cost · slow OK', xCell: 2, yCell: 0 },
    { label: 'Premium', sub: 'Spend money to be fast', xCell: 0, yCell: 2 },
    { label: 'Justify it', sub: 'Slow and expensive', xCell: 2, yCell: 2 },
  ];

  return (
    <div className="not-prose">
      <div className="relative w-full overflow-x-auto">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto min-w-[640px]" role="img" aria-label="Cost vs. latency matrix of every entry">
          {/* Background quadrants */}
          {QUADRANTS.map((q) => (
            <g key={q.label}>
              <rect
                x={PAD_LEFT + q.xCell * CELL_W}
                y={PAD_TOP + (COST_ORDER.length - 2 - q.yCell) * CELL_H}
                width={CELL_W * 2}
                height={CELL_H * 2}
                fill="none"
              />
            </g>
          ))}

          {/* Grid lines */}
          {LATENCY_ORDER.map((_, i) => (
            <line
              key={`v-${i}`}
              x1={PAD_LEFT + i * CELL_W}
              y1={PAD_TOP}
              x2={PAD_LEFT + i * CELL_W}
              y2={PAD_TOP + GRID_H}
              stroke="#e5e7eb"
              strokeDasharray={i === 0 ? undefined : '3 3'}
              strokeWidth={1}
            />
          ))}
          <line x1={PAD_LEFT + GRID_W} y1={PAD_TOP} x2={PAD_LEFT + GRID_W} y2={PAD_TOP + GRID_H} stroke="#e5e7eb" />
          {COST_ORDER.map((_, i) => (
            <line
              key={`h-${i}`}
              x1={PAD_LEFT}
              y1={PAD_TOP + i * CELL_H}
              x2={PAD_LEFT + GRID_W}
              y2={PAD_TOP + i * CELL_H}
              stroke="#e5e7eb"
              strokeDasharray={i === 0 ? undefined : '3 3'}
              strokeWidth={1}
            />
          ))}
          <line x1={PAD_LEFT} y1={PAD_TOP + GRID_H} x2={PAD_LEFT + GRID_W} y2={PAD_TOP + GRID_H} stroke="#e5e7eb" />

          {/* Quadrant labels (subtle, top-left of each 2x2) */}
          {QUADRANTS.map((q) => (
            <g key={`label-${q.label}`}>
              <text
                x={PAD_LEFT + q.xCell * CELL_W + 8}
                y={PAD_TOP + (COST_ORDER.length - 2 - q.yCell) * CELL_H + 16}
                fill="#9CA3AF"
                fontSize={10}
                fontFamily="ui-monospace, monospace"
                style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
              >
                {q.label}
              </text>
              <text
                x={PAD_LEFT + q.xCell * CELL_W + 8}
                y={PAD_TOP + (COST_ORDER.length - 2 - q.yCell) * CELL_H + 30}
                fill="#9CA3AF"
                fontSize={9}
                fontFamily="ui-monospace, monospace"
              >
                {q.sub}
              </text>
            </g>
          ))}

          {/* X axis (latency) labels */}
          {LATENCY_ORDER.map((t, i) => (
            <text
              key={`xl-${t}`}
              x={PAD_LEFT + i * CELL_W + CELL_W / 2}
              y={PAD_TOP + GRID_H + 22}
              textAnchor="middle"
              fill="#6B7280"
              fontSize={12}
              fontFamily="ui-monospace, monospace"
            >
              {t}
            </text>
          ))}
          <text x={PAD_LEFT + GRID_W / 2} y={PAD_TOP + GRID_H + 50} textAnchor="middle" fill="#374151" fontSize={13} fontWeight={600}>
            Latency →
          </text>

          {/* Y axis (cost) labels */}
          {COST_ORDER.map((t, i) => (
            <text
              key={`yl-${t}`}
              x={PAD_LEFT - 12}
              y={PAD_TOP + (COST_ORDER.length - 1 - i) * CELL_H + CELL_H / 2 + 4}
              textAnchor="end"
              fill="#6B7280"
              fontSize={12}
              fontFamily="ui-monospace, monospace"
            >
              {t}
            </text>
          ))}
          <text
            x={20}
            y={PAD_TOP + GRID_H / 2}
            textAnchor="middle"
            fill="#374151"
            fontSize={13}
            fontWeight={600}
            transform={`rotate(-90 20 ${PAD_TOP + GRID_H / 2})`}
          >
            Cost ↑
          </text>

          {/* Bubbles */}
          {placements.map((p) => {
            const c = cohortFill(p.meta);
            const isHovered = hovered?.cmp.id === p.cmp.id;
            return (
              <g
                key={p.cmp.id}
                onMouseEnter={() => setHovered(p)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => (window.location.href = entryHref(p.meta))}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={p.cx}
                  cy={p.cy}
                  r={p.r}
                  fill={c.bg}
                  stroke={c.border}
                  strokeWidth={isHovered ? 3 : 1.5}
                  opacity={hovered && !isHovered ? 0.4 : 0.9}
                />
                <text
                  x={p.cx}
                  y={p.cy + p.r + 12}
                  textAnchor="middle"
                  fill={c.text}
                  fontSize={10}
                  fontFamily="ui-monospace, monospace"
                  style={{ pointerEvents: 'none' }}
                  opacity={hovered && !isHovered ? 0.3 : 1}
                >
                  {p.meta.name}
                </text>
              </g>
            );
          })}
        </svg>

        {hovered && (
          <div className="absolute top-2 right-2 max-w-xs bg-bg border border-surface-border rounded-lg shadow-card px-4 py-3 text-sm">
            <div className="font-medium text-text mb-0.5">{hovered.meta.name}</div>
            <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-2">
              {hovered.meta.kind === 'pattern' ? hovered.meta.category : hovered.meta.kind}
            </div>
            <div className="text-text-secondary text-sm">{hovered.cmp.bestFor}</div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-mono text-text-tertiary">
              <span>complexity: {hovered.cmp.complexity.toLowerCase()}</span>
              <span>cost: {hovered.cmp.cost.toLowerCase()}</span>
              <span>latency: {hovered.cmp.latency.toLowerCase()}</span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono">
        <span className="text-text-tertiary uppercase tracking-wider">Cohorts:</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-200 border border-emerald-500" />workflows</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-200 border border-amber-500" />agent patterns</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-sky-200 border border-sky-500" />primitives</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-violet-200 border border-violet-500" />modifiers</span>
        <span className="text-text-tertiary">·</span>
        <span className="text-text-tertiary">bubble size = complexity</span>
      </div>
    </div>
  );
}
