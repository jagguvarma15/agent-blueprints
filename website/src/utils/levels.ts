import { readMarkdown, extractHeadings, type Heading } from './content';
import { renderMarkdown } from './markdown';

/**
 * The five canonical levels every blueprint is documented at. Rendered as the
 * tab set on every cohort detail page. `overview.md` carries the Concepts level
 * (the filename is kept for back-compat as the catalog `directory_entry`).
 */
const LEVELS: { id: string; file: string; label: string }[] = [
  { id: 'overview', file: 'overview.md', label: 'Concepts' },
  { id: 'architecture', file: 'architecture.md', label: 'Architecture' },
  { id: 'flow', file: 'flow.md', label: 'Flow' },
  { id: 'design', file: 'design.md', label: 'Design' },
  { id: 'implementation', file: 'implementation.md', label: 'Implementation' },
];

/**
 * Quality / lifecycle facets folded into the Design level rather than shown as
 * co-equal level tabs. The files remain on disk (and stay linked from prose);
 * here their content is appended under Design.
 */
const DESIGN_FACETS = ['evolution.md', 'observability.md', 'cost-and-latency.md'];

function stripFirstH1(md: string): string {
  return md.replace(/^#\s+.*(?:\r?\n)+/, '');
}

export interface LevelDocs {
  tabs: { id: string; label: string }[];
  content: Record<string, string>;
  headings: Record<string, Heading[]>;
}

/**
 * Read an entry's level docs, fold the design facets, and render to HTML.
 * `dir` is the repo-relative entry directory, e.g. `patterns/react`.
 * Levels with no file are skipped, so entries mid-rollout never show empty tabs.
 */
export function buildLevelDocs(dir: string): LevelDocs {
  const tabs: { id: string; label: string }[] = [];
  const content: Record<string, string> = {};
  const headings: Record<string, Heading[]> = {};
  for (const lvl of LEVELS) {
    let md = readMarkdown(`${dir}/${lvl.file}`);
    if (lvl.id === 'design') {
      const folded = DESIGN_FACETS.map((f) => readMarkdown(`${dir}/${f}`))
        .filter((x): x is string => Boolean(x))
        .map(stripFirstH1);
      if (folded.length) md = [md, ...folded].filter(Boolean).join('\n\n');
    }
    if (!md) continue;
    tabs.push({ id: lvl.id, label: lvl.label });
    content[lvl.id] = renderMarkdown(md);
    headings[lvl.id] = extractHeadings(md);
  }
  return { tabs, content, headings };
}
