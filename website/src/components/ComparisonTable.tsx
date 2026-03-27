import { useState } from 'react';
import type { PatternComparison } from '../data/patterns';

type SortKey = keyof PatternComparison;
type SortDir = 'asc' | 'desc';

const COMPLEXITY_ORDER = { Beginner: 0, Intermediate: 1, Advanced: 2 };
const LEVEL_ORDER = { Low: 0, Medium: 1, High: 2, Variable: 3 };

interface ComparisonTableProps {
  patterns: PatternComparison[];
  base: string;
}

export default function ComparisonTable({ patterns, base }: ComparisonTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('category');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'workflow' | 'agent'>('all');

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function sortValue(p: PatternComparison, key: SortKey): number | string {
    switch (key) {
      case 'complexity': return COMPLEXITY_ORDER[p.complexity];
      case 'latency': return LEVEL_ORDER[p.latency];
      case 'cost': return LEVEL_ORDER[p.cost];
      default: return String(p[key]);
    }
  }

  const filtered = patterns.filter((p) => filter === 'all' || p.category === filter);
  const sorted = [...filtered].sort((a, b) => {
    const va = sortValue(a, sortKey);
    const vb = sortValue(b, sortKey);
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="opacity-30">↕</span>;
    return <span className="text-accent">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  function LevelBadge({ value }: { value: string }) {
    const colors: Record<string, string> = {
      Low: 'bg-green-50 text-green-700 border-green-200',
      Medium: 'bg-amber-50 text-amber-700 border-amber-200',
      High: 'bg-red-50 text-red-700 border-red-200',
      Variable: 'bg-blue-50 text-blue-700 border-blue-200',
      Beginner: 'bg-green-50 text-green-700 border-green-200',
      Intermediate: 'bg-amber-50 text-amber-700 border-amber-200',
      Advanced: 'bg-red-50 text-red-700 border-red-200',
    };
    return (
      <span className={`text-2xs font-mono px-1.5 py-0.5 rounded border font-medium ${colors[value] || 'bg-surface border-surface-border text-text-secondary'}`}>
        {value}
      </span>
    );
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-4">
        {(['all', 'workflow', 'agent'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors font-medium capitalize ${
              filter === f
                ? 'bg-accent text-white border-accent'
                : 'bg-bg border-surface-border text-text-secondary hover:text-text hover:bg-surface'
            }`}
          >
            {f === 'all' ? 'All Patterns' : f === 'workflow' ? 'Workflows' : 'Agent Patterns'}
          </button>
        ))}
        <span className="ml-auto text-xs text-text-tertiary font-mono">{sorted.length} patterns</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-bg-alt border-b border-surface-border">
              {[
                { key: 'name' as SortKey, label: 'Pattern' },
                { key: 'category' as SortKey, label: 'Category' },
                { key: 'complexity' as SortKey, label: 'Complexity' },
                { key: 'latency' as SortKey, label: 'Latency' },
                { key: 'cost' as SortKey, label: 'Cost' },
                { key: 'bestFor' as SortKey, label: 'Best For' },
              ].map(({ key, label }) => (
                <th
                  key={key}
                  className="text-left px-4 py-3 font-semibold text-text cursor-pointer select-none hover:text-accent transition-colors whitespace-nowrap"
                  onClick={() => handleSort(key)}
                >
                  {label} <SortIcon col={key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <>
                <tr
                  key={p.id}
                  className="border-b border-surface-border hover:bg-bg-alt transition-colors cursor-pointer"
                  onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                >
                  <td className="px-4 py-3 font-medium text-text">
                    <div className="flex items-center gap-2">
                      <svg
                        className={`flex-shrink-0 transition-transform text-text-tertiary ${expandedId === p.id ? 'rotate-90' : ''}`}
                        width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                      >
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                      <a
                        href={`${base}/${p.category === 'workflow' ? 'workflows' : 'patterns'}/${p.id}/`}
                        className="hover:text-accent transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {p.name}
                      </a>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-2xs font-mono px-1.5 py-0.5 rounded border font-medium ${
                      p.category === 'workflow'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {p.category === 'workflow' ? 'Workflow' : 'Agent'}
                    </span>
                  </td>
                  <td className="px-4 py-3"><LevelBadge value={p.complexity} /></td>
                  <td className="px-4 py-3"><LevelBadge value={p.latency} /></td>
                  <td className="px-4 py-3"><LevelBadge value={p.cost} /></td>
                  <td className="px-4 py-3 text-text-secondary max-w-xs truncate">{p.bestFor}</td>
                </tr>

                {expandedId === p.id && (
                  <tr key={`${p.id}-expanded`} className="bg-bg-alt border-b border-surface-border">
                    <td colSpan={6} className="px-6 py-4">
                      <div className="flex flex-wrap gap-6 text-sm">
                        <div>
                          <p className="text-2xs font-semibold font-mono uppercase tracking-wider text-text-tertiary mb-1.5">Requires</p>
                          {p.requires.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {p.requires.map((r) => (
                                <span key={r} className="text-xs bg-surface border border-surface-border px-2 py-0.5 rounded-md font-mono text-text-secondary">
                                  {r}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-text-tertiary font-mono">None</span>
                          )}
                        </div>
                        <div>
                          <p className="text-2xs font-semibold font-mono uppercase tracking-wider text-text-tertiary mb-1.5">Composable with</p>
                          <div className="flex flex-wrap gap-1">
                            {p.composableWith.map((c) => (
                              <a
                                key={c}
                                href={`${base}/${['prompt-chaining','parallel-calls','orchestrator-worker','evaluator-optimizer'].includes(c) ? 'workflows' : 'patterns'}/${c}/`}
                                className="text-xs bg-accent-light border border-accent-border px-2 py-0.5 rounded-md font-mono text-accent hover:bg-accent hover:text-white transition-colors"
                              >
                                {c}
                              </a>
                            ))}
                          </div>
                        </div>
                        <div className="ml-auto">
                          <a
                            href={`${base}/${p.category === 'workflow' ? 'workflows' : 'patterns'}/${p.id}/`}
                            className="text-xs text-accent font-medium hover:text-accent-hover transition-colors"
                          >
                            View full pattern →
                          </a>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
