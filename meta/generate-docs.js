#!/usr/bin/env node
/**
 * Generate the auto-derivable parts of the repo's markdown documentation
 * from `patterns-catalog.yaml` + `taxonomy.yaml`.
 *
 * Files are scanned for marker blocks of the form:
 *
 *   <!-- AUTO:<directive> [arg=value] [arg=value] -->
 *   ... generated content goes here ...
 *   <!-- /AUTO -->
 *
 * The block contents are rewritten by the directive. Narrative content
 * outside the markers is untouched.
 *
 * Supported directives:
 *
 *   <!-- AUTO:cohort-table cohort=<id> [columns=...] -->
 *     Renders a markdown table listing every entry in the named cohort.
 *
 *   <!-- AUTO:count cohort=<id> [filter=category:<value>] -->
 *     Renders the integer entry-count of the named cohort (optionally filtered
 *     by category). Works inline so "N patterns" claims in prose and table
 *     cells stay in sync, e.g.:
 *       holds <!-- AUTO:count cohort=patterns -->14<!-- /AUTO --> patterns
 *
 *   <!-- AUTO:entry-list cohort=<id> [base=<path>] -->
 *     Renders a markdown bullet list of entries, linking each entry to its
 *     overview.md. The optional `base` is a relative-path prefix prepended
 *     to each link (use to fix relative links when the marker is nested in
 *     a subdirectory).
 *
 *   <!-- AUTO:cohort-list -->
 *     Renders a bullet list of cohorts: "**<id>** — <description> (<n> entries)".
 *
 *   <!-- AUTO:repository-tree -->
 *     Renders a simple ASCII tree showing top-level directories with entry
 *     counts where applicable.
 *
 *   <!-- AUTO:choose-primitive-table -->
 *   <!-- AUTO:choose-modifier-table -->
 *     Renders the "When to add this primitive/modifier" picker tables for
 *     foundations/choosing-a-pattern.md.
 *
 * Run from the repo root:
 *   node meta/generate-docs.js
 *
 * Idempotent: regenerating against unchanged inputs produces byte-identical
 * output. CI gates this with `node meta/generate-docs.js && git diff --exit-code`.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '..');
const CATALOG_PATH = join(ROOT, 'patterns-catalog.yaml');
const TAXONOMY_PATH = join(ROOT, 'taxonomy.yaml');

if (!existsSync(CATALOG_PATH)) {
  console.error(`MISSING: ${CATALOG_PATH}; run node meta/validate-metadata.js --emit patterns-catalog.yaml first.`);
  process.exit(2);
}
if (!existsSync(TAXONOMY_PATH)) {
  console.error(`MISSING: ${TAXONOMY_PATH}`);
  process.exit(2);
}

const CATALOG = yaml.load(readFileSync(CATALOG_PATH, 'utf-8'));
const TAXONOMY = yaml.load(readFileSync(TAXONOMY_PATH, 'utf-8'));

// Map cohort id → cohort entry (from taxonomy.yaml).
const COHORT_BY_ID = new Map(TAXONOMY.cohorts.map((c) => [c.id, c]));

// Map cohort id → array of catalog entries (from patterns-catalog.yaml).
const ENTRIES_BY_COHORT = {};
for (const cohort of TAXONOMY.cohorts) {
  ENTRIES_BY_COHORT[cohort.id] = CATALOG[cohort.catalog_key] || [];
}

// ---------------------------------------------------------------------------
// Marker scanner — walk the repo for AUTO blocks.
// ---------------------------------------------------------------------------

const AUTO_OPEN_RE = /<!--\s*AUTO:([a-zA-Z][a-zA-Z0-9-]*)([^>]*)-->/;
const AUTO_CLOSE_RE = /<!--\s*\/AUTO\s*-->/;
// Matches a complete inline (same-line) block: open marker, inner, close marker.
const AUTO_INLINE_RE = /(<!--\s*AUTO:([a-zA-Z][a-zA-Z0-9-]*)([^>]*)-->)(.*?)(<!--\s*\/AUTO\s*-->)/g;
const MARKDOWN_GLOB_DIRS = [
  '.',
  'patterns',
  'primitives',
  'modifiers',
  'foundations',
  'composition',
  'meta',
];

function walkMarkdownFiles() {
  const files = [];
  for (const dir of MARKDOWN_GLOB_DIRS) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    if (dir === '.') {
      for (const name of readdirSync(abs)) {
        if (name.endsWith('.md')) files.push(join(abs, name));
      }
      continue;
    }
    walkDirRecursive(abs, files);
  }
  // Dedupe (in case a dir is listed twice).
  return Array.from(new Set(files));
}

function walkDirRecursive(dir, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules and other heavy dirs.
      if (['node_modules', '__pycache__'].includes(entry.name)) continue;
      walkDirRecursive(full, acc);
    } else if (entry.name.endsWith('.md')) {
      acc.push(full);
    }
  }
}

// ---------------------------------------------------------------------------
// Directive renderers
// ---------------------------------------------------------------------------

function parseDirectiveArgs(argString) {
  // argString is the raw text after the directive name; e.g. "cohort=patterns base=../".
  const args = {};
  const re = /([a-zA-Z][a-zA-Z0-9_-]*)=([^\s]+)/g;
  let m;
  while ((m = re.exec(argString))) {
    args[m[1]] = m[2];
  }
  return args;
}

function renderCohortTable(args) {
  const cohort = COHORT_BY_ID.get(args.cohort);
  if (!cohort) {
    return `<!-- AUTO ERROR: unknown cohort '${args.cohort}' -->`;
  }
  let entries = ENTRIES_BY_COHORT[cohort.id] || [];
  // Optional filter=category:<value> trims to entries matching that category.
  if (args.filter) {
    const m = args.filter.match(/^category:([a-zA-Z][a-zA-Z0-9_-]*)$/);
    if (m) entries = entries.filter((e) => e.category === m[1]);
  }
  if (entries.length === 0) {
    return '_(no entries)_';
  }
  // Path prefix for links (use `base=./` from the repo root, `base=../` from
  // a one-level-deep file, default `base=./`).
  const base = args.base || './';
  const style = args.style || 'default';

  if (style === 'tiers') {
    // README-style table with links to each tier file. Evolves-from is shown
    // when present.
    const showEvolves = entries.some((e) => e.evolvesFrom && e.evolvesFrom.length);
    const head = showEvolves
      ? ['| Pattern | What It Does | Evolves From | Overview | Design | Implementation |', '|---|---|---|---|---|---|']
      : ['| Pattern | What It Does | Overview | Design | Implementation |', '|---|---|---|---|---|'];
    const rows = entries.map((e) => {
      const tiers = e.tier_files || {};
      const overview = tiers.overview ? `[overview](${base}${tiers.overview})` : '—';
      const design = tiers.design ? `[design](${base}${tiers.design})` : '—';
      const impl = tiers.implementation ? `[impl](${base}${tiers.implementation})` : '—';
      const evolves = showEvolves
        ? ` ${(e.evolvesFrom || []).map((id) => byId(id)?.name || id).join(', ') || '—'} |`
        : '';
      return showEvolves
        ? `| **${e.name}** | ${e.description} |${evolves} ${overview} | ${design} | ${impl} |`
        : `| **${e.name}** | ${e.description} | ${overview} | ${design} | ${impl} |`;
    });
    return [...head, ...rows].join('\n');
  }

  // Default: id/name/category/complexity/description.
  const lines = ['| ID | Name | Category | Complexity | Description |', '|---|---|---|---|---|'];
  for (const entry of entries) {
    lines.push(`| \`${entry.id}\` | ${entry.name} | ${entry.category} | ${entry.complexity} | ${entry.description} |`);
  }
  return lines.join('\n');
}

function renderCount(args) {
  const cohort = COHORT_BY_ID.get(args.cohort);
  if (!cohort) {
    return `<!-- AUTO ERROR: unknown cohort '${args.cohort}' -->`;
  }
  let entries = ENTRIES_BY_COHORT[cohort.id] || [];
  // Optional filter=category:<value> trims to entries matching that category.
  if (args.filter) {
    const m = args.filter.match(/^category:([a-zA-Z][a-zA-Z0-9_-]*)$/);
    if (m) entries = entries.filter((e) => e.category === m[1]);
  }
  return String(entries.length);
}

// Build a flat id → entry lookup for cross-references.
const ALL_ENTRIES = Object.values(ENTRIES_BY_COHORT).flat();
function byId(id) {
  return ALL_ENTRIES.find((e) => e.id === id);
}

function renderEntryList(args) {
  const cohort = COHORT_BY_ID.get(args.cohort);
  if (!cohort) {
    return `<!-- AUTO ERROR: unknown cohort '${args.cohort}' -->`;
  }
  const base = args.base || '';
  const entries = ENTRIES_BY_COHORT[cohort.id] || [];
  if (entries.length === 0) {
    return '_(no entries)_';
  }
  return entries
    .map((entry) => {
      const overview = `${base}${cohort.dir}/${entry.id}/overview.md`;
      return `- [\`${entry.id}\`](${overview}) — ${entry.description}`;
    })
    .join('\n');
}

function renderCohortList() {
  const lines = [];
  for (const cohort of TAXONOMY.cohorts) {
    const entries = ENTRIES_BY_COHORT[cohort.id] || [];
    const desc = (cohort.description || '').replace(/\s+/g, ' ').trim();
    lines.push(`- **${cohort.label_plural}** — ${desc} (${entries.length} ${entries.length === 1 ? 'entry' : 'entries'})`);
  }
  return lines.join('\n');
}

function renderRepositoryTree() {
  const lines = ['agent-blueprints/'];
  // Top-level directories with entry counts where it makes sense.
  const TOP_LEVEL_ORDER = ['foundations', 'patterns', 'primitives', 'modifiers', 'composition', 'meta', 'code', 'tests', 'website'];
  const COMMENTS = {
    foundations: 'Core concepts, terminology, pattern selection',
    composition: 'How patterns + primitives + modifiers combine',
    meta: 'Contributing guides, taxonomy schema, generators',
    code: 'Reference implementations (per-entry under each cohort)',
    tests: 'metadata + link validation',
    website: 'Docs site',
  };
  const seen = [];
  for (const name of TOP_LEVEL_ORDER) {
    if (!existsSync(join(ROOT, name))) continue;
    seen.push(name);
  }
  // Add anything not in the ordered list, sorted.
  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (['node_modules', '__pycache__'].includes(entry.name)) continue;
    if (!seen.includes(entry.name)) seen.push(entry.name);
  }
  for (let i = 0; i < seen.length; i++) {
    const name = seen[i];
    const last = i === seen.length - 1;
    const connector = last ? '└──' : '├──';
    // Cohort directories get the entry count.
    const cohort = TAXONOMY.cohorts.find((c) => c.dir === name);
    let comment = COMMENTS[name] || '';
    if (cohort) {
      const count = ENTRIES_BY_COHORT[cohort.id].length;
      const noun = count === 1 ? cohort.label : cohort.label_plural;
      const cohortComment = `${count} ${noun.toLowerCase()} entries`;
      comment = comment ? `${comment} — ${cohortComment}` : cohortComment;
    }
    const padded = `${name}/`.padEnd(22);
    lines.push(comment ? `${connector} ${padded} # ${comment}` : `${connector} ${padded}`);
  }
  return lines.join('\n');
}

function renderChooseTable(cohortId) {
  // Hand-curated picker hints per entry. Tables match foundations/choosing-a-pattern.md
  // wording. Keep these here (rather than in metadata.json) because the
  // phrasing is narrative — "Does the agent need X?" — and varies by author.
  const HINTS = {
    tool_use: 'Does the agent need to invoke functions / call APIs / interact with structured systems?',
    memory: 'Does the agent need state that persists across sessions or conversations?',
    skills: 'Does the agent need codified procedural knowledge (your org\'s review checklist, citation format, lookup-and-summarize routine)?',
    human_in_the_loop: 'Does the agent take high-stakes actions that should require human approval before commit?',
  };
  const cohort = COHORT_BY_ID.get(cohortId);
  if (!cohort) {
    return `<!-- AUTO ERROR: unknown cohort '${cohortId}' -->`;
  }
  const entries = ENTRIES_BY_COHORT[cohort.id] || [];
  if (entries.length === 0) {
    return '_(no entries)_';
  }
  const lines = ['| Question | Add this |', '|---|---|'];
  for (const entry of entries) {
    const hint = HINTS[entry.id] || `Is ${entry.name} the right shape for your use case?`;
    const link = `../${cohort.dir}/${entry.id}/overview.md`;
    lines.push(`| ${hint} | [\`${entry.id}\`](${link}) |`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

function renderDirective(directive, args, absPath, lineNo) {
  switch (directive) {
    case 'cohort-table':
      return renderCohortTable(args);
    case 'entry-list':
      return renderEntryList(args);
    case 'cohort-list':
      return renderCohortList();
    case 'repository-tree':
      return renderRepositoryTree();
    case 'choose-primitive-table':
      return renderChooseTable('primitives');
    case 'choose-modifier-table':
      return renderChooseTable('modifiers');
    case 'count':
      return renderCount(args);
    default:
      throw new Error(`${absPath}:${lineNo + 1}: unknown AUTO directive '${directive}'`);
  }
}

// True when a line contains a complete inline AUTO block (open + close on the
// same line) — handled in-place rather than as a multi-line block.
function hasInlineAuto(line) {
  const open = line.match(AUTO_OPEN_RE);
  if (!open) return false;
  return AUTO_CLOSE_RE.test(line.slice(open.index + open[0].length));
}

function processFile(absPath) {
  const text = readFileSync(absPath, 'utf-8');
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  let changed = false;

  while (i < lines.length) {
    const line = lines[i];

    // Inline (same-line) AUTO blocks: `<!-- AUTO:x -->VALUE<!-- /AUTO -->` all
    // on one line. Needed for counts embedded mid-sentence or in table cells.
    if (hasInlineAuto(line)) {
      const replaced = line.replace(AUTO_INLINE_RE, (full, open, directive, argStr, inner, closeTag) => {
        const rendered = renderDirective(directive, parseDirectiveArgs(argStr || ''), absPath, i);
        if (inner !== rendered) changed = true;
        return `${open}${rendered}${closeTag}`;
      });
      out.push(replaced);
      i++;
      continue;
    }

    const match = line.match(AUTO_OPEN_RE);
    if (!match) {
      out.push(line);
      i++;
      continue;
    }

    // Found an open marker. Pass the open marker through unchanged.
    out.push(line);
    const directive = match[1];
    const argString = match[2] || '';
    const args = parseDirectiveArgs(argString);

    // Find the matching close marker.
    let close = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (AUTO_CLOSE_RE.test(lines[j])) {
        close = j;
        break;
      }
      // Disallow nested open markers (the simple parser doesn't handle them).
      if (AUTO_OPEN_RE.test(lines[j])) {
        throw new Error(`${absPath}:${j + 1}: nested AUTO marker (not supported)`);
      }
    }
    if (close === -1) {
      throw new Error(`${absPath}:${i + 1}: AUTO marker has no closing tag`);
    }

    // Render the new content.
    const rendered = renderDirective(directive, args, absPath, i);

    // Compare with current content (between open and close) — if same, no change.
    const currentInner = lines.slice(i + 1, close).join('\n');
    if (currentInner !== rendered) changed = true;

    // Emit the rendered block, then the close marker.
    out.push(rendered);
    out.push(lines[close]);
    i = close + 1;
  }

  const result = out.join('\n');
  if (result !== text) {
    writeFileSync(absPath, result, 'utf-8');
    return { changed: true, hadAuto: true };
  }
  return { changed: false, hadAuto: changed };
}

const allFiles = walkMarkdownFiles();
let totalProcessed = 0;
let totalChanged = 0;
for (const file of allFiles) {
  const text = readFileSync(file, 'utf-8');
  if (!AUTO_OPEN_RE.test(text)) continue;
  totalProcessed++;
  const result = processFile(file);
  if (result.changed) {
    totalChanged++;
    console.log(`updated: ${file.slice(ROOT.length + 1)}`);
  }
}
console.log(`Scanned ${allFiles.length} markdown files; ${totalProcessed} contain AUTO markers; ${totalChanged} updated.`);
