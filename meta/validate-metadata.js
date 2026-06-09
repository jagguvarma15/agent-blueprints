#!/usr/bin/env node
/**
 * Validates that every pattern and workflow directory has a valid metadata.json,
 * and that the key fields match the patterns.ts data file in the website.
 *
 * Run from the repo root:
 *   node meta/validate-metadata.js
 *   node meta/validate-metadata.js --emit patterns-catalog.yaml
 *
 * `--emit <path>` aggregates the validated metadata + resolved tier-file
 * paths + parsed composition matrix into a single machine-readable catalog
 * consumed by agent-deployments CI. See PATTERNS_CATALOG_SCHEMA.md.
 *
 * Used in CI to catch sync issues between metadata.json files and patterns.ts,
 * and (with --emit) to gate drift between the per-pattern metadata and the
 * aggregated catalog.
 */

import { readFileSync, existsSync, writeFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '..');

// --emit <path>: aggregate validated metadata into patterns-catalog.yaml.
const EMIT_FLAG_INDEX = process.argv.indexOf('--emit');
const EMIT_PATH = EMIT_FLAG_INDEX !== -1 ? process.argv[EMIT_FLAG_INDEX + 1] : null;
if (EMIT_FLAG_INDEX !== -1 && !EMIT_PATH) {
  console.error('Usage: --emit <path>');
  process.exit(2);
}

const REQUIRED_FIELDS = ['id', 'name', 'category', 'complexity', 'description', 'tiers'];
const VALID_CATEGORIES = ['workflow', 'agent', 'primitive', 'modifier'];
const VALID_COMPLEXITIES = ['Beginner', 'Intermediate', 'Advanced'];

// Three-tier taxonomy (catalog v2):
//   patterns/    — flow shapes (LLM-controlled or code-controlled). Each
//                  entry's metadata.json category is 'agent' or 'workflow'.
//   primitives/  — orthogonal building blocks the agent uses (tool_use,
//                  memory, skills). category='primitive'.
//   modifiers/   — transformations layered on a pattern (human_in_the_loop).
//                  category='modifier'.
const PATTERN_DIRS = [
  'patterns/prompt-chaining',
  'patterns/parallel-calls',
  'patterns/orchestrator-worker',
  'patterns/evaluator-optimizer',
  'patterns/react',
  'patterns/plan_and_execute',
  'patterns/rag',
  'patterns/reflection',
  'patterns/routing',
  'patterns/multi_agent',
  'patterns/event_driven',
  'patterns/saga',
];
const PRIMITIVE_DIRS = [
  'primitives/tool_use',
  'primitives/memory',
  'primitives/skills',
];
const MODIFIER_DIRS = [
  'modifiers/human_in_the_loop',
];
const ALL_DIRS = [...PATTERN_DIRS, ...PRIMITIVE_DIRS, ...MODIFIER_DIRS];

// Per-tier expected metadata.category values. Used to flag mis-tagged
// entries (e.g. a primitive that still says category: 'agent').
const EXPECTED_CATEGORY_BY_DIR = new Map([
  ...PATTERN_DIRS.map((d) => [d, ['agent', 'workflow']]),
  ...PRIMITIVE_DIRS.map((d) => [d, ['primitive']]),
  ...MODIFIER_DIRS.map((d) => [d, ['modifier']]),
]);

// Catalog emission constants — declared up here so they're outside the
// temporal dead zone when emitCatalog() runs at the validator's success path.
const TIER_FILE_NAMES = [
  'overview',
  'design',
  'implementation',
  'evolution',
  'observability',
  'cost-and-latency',
];
const EXTRA_SUBDIRS = ['prompts', 'schemas', 'code', 'examples'];
const SCHEMA_VERSION = 2;
const GENERATOR_VERSION = '2.0.0';
const COMPOSITION_MATRIX_PATH = 'composition/combination-matrix.md';
// YAML emitter constants — same TDZ rationale; quoteString runs deep inside
// the emitCatalog call chain.
const YAML_RESERVED = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~']);
const SAFE_BARE_RE = /^[A-Za-z_][A-Za-z0-9_.\-/]*$/;

let errors = 0;
// Map of dir → parsed metadata. Populated as we validate; consumed by --emit.
const PARSED = new Map();

// Cache the id-set across all three tiers so cross-references (evolvesFrom,
// composableWith, etc.) can resolve to any cohort — a pattern can compose
// with a primitive (e.g. react ↔ memory) and vice versa.
const ALL_IDS = new Set(ALL_DIRS.map((d) => d.split('/')[1]));

for (const dir of ALL_DIRS) {
  const metaPath = join(ROOT, dir, 'metadata.json');

  if (!existsSync(metaPath)) {
    console.error(`MISSING: ${dir}/metadata.json`);
    errors++;
    continue;
  }

  let meta;
  try {
    meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
  } catch (e) {
    console.error(`INVALID JSON: ${dir}/metadata.json — ${e.message}`);
    errors++;
    continue;
  }
  PARSED.set(dir, meta);

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!(field in meta)) {
      console.error(`MISSING FIELD "${field}": ${dir}/metadata.json`);
      errors++;
    }
  }

  // Check field values
  if (meta.category && !VALID_CATEGORIES.includes(meta.category)) {
    console.error(`INVALID category "${meta.category}": ${dir}/metadata.json`);
    errors++;
  }

  // Tier ↔ category coherence: a directory's expected category list must
  // contain the metadata.category value. Catches a primitive that still
  // says category: 'agent', or a pattern accidentally marked 'modifier'.
  const expectedCats = EXPECTED_CATEGORY_BY_DIR.get(dir);
  if (expectedCats && meta.category && !expectedCats.includes(meta.category)) {
    console.error(
      `CATEGORY MISMATCH: ${dir}/metadata.json says category="${meta.category}", expected one of ${JSON.stringify(expectedCats)}`,
    );
    errors++;
  }

  if (meta.complexity && !VALID_COMPLEXITIES.includes(meta.complexity)) {
    console.error(`INVALID complexity "${meta.complexity}": ${dir}/metadata.json`);
    errors++;
  }

  // Check that id matches directory name
  const expectedId = dir.split('/')[1];
  if (meta.id !== expectedId) {
    console.error(`ID MISMATCH: expected "${expectedId}", got "${meta.id}" in ${dir}/metadata.json`);
    errors++;
  }

  // Check that referenced patterns exist — cross-cohort refs are allowed.
  for (const field of ['evolvesFrom', 'evolvesInto', 'composableWith', 'appliesTo']) {
    if (meta[field]) {
      for (const refId of meta[field]) {
        // 'any' is the wildcard for modifier.appliesTo — accept it.
        if (refId === 'any') continue;
        if (!ALL_IDS.has(refId)) {
          console.error(`UNKNOWN REF "${refId}" in ${field}: ${dir}/metadata.json`);
          errors++;
        }
      }
    }
  }

  // Check that tier files exist
  if (meta.tiers) {
    for (const tier of meta.tiers) {
      const tierFile = join(ROOT, dir, `${tier}.md`);
      if (!existsSync(tierFile)) {
        console.error(`MISSING TIER FILE: ${dir}/${tier}.md (referenced in metadata.json)`);
        errors++;
      }
    }
  }
}

// Cross-check that every id is registered in the website data file.
// Without this, a new pattern / primitive / modifier can ship to the repo
// with all its docs and metadata, pass CI, and still be invisible on the
// deployed site.
const SITE_DATA_PATH = join(ROOT, 'website/src/data/patterns.ts');
if (existsSync(SITE_DATA_PATH)) {
  const siteData = readFileSync(SITE_DATA_PATH, 'utf-8');
  for (const dir of ALL_DIRS) {
    const id = dir.split('/')[1];
    // Match either single or double quoted id literals.
    if (!siteData.includes(`id: '${id}'`) && !siteData.includes(`id: "${id}"`)) {
      console.error(
        `MISSING FROM SITE DATA: "${id}" is in metadata but not registered in website/src/data/patterns.ts`,
      );
      errors++;
    }
  }
} else {
  console.error(`MISSING FILE: ${SITE_DATA_PATH}`);
  errors++;
}

if (errors === 0) {
  console.log(
    `All ${ALL_DIRS.length} metadata.json files are valid ` +
      `(${PATTERN_DIRS.length} patterns + ${PRIMITIVE_DIRS.length} primitives + ${MODIFIER_DIRS.length} modifiers).`,
  );
  if (EMIT_PATH) {
    emitCatalog(EMIT_PATH);
  }
  process.exit(0);
} else {
  console.error(`\n${errors} validation error(s) found.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Catalog emission (--emit)
// ---------------------------------------------------------------------------

/**
 * Aggregate per-tier metadata + tier-file paths + composition matrix into
 * a deterministic YAML catalog. No timestamps, no commit SHAs — the output is
 * a pure function of the source files, so the drift CI can byte-diff.
 *
 * Catalog v2 shape:
 *   patterns[]    — 12 entries; agent + workflow categories interleaved.
 *   workflows[]   — derived view (patterns[] filtered to category=workflow).
 *                   Kept for one release as a backward-compat affordance.
 *   primitives[]  — 3 entries (tool_use, memory, skills).
 *   modifiers[]   — 1 entry (human_in_the_loop), with appliesTo list.
 *   compositions[] — unchanged shape; cross-cohort edges allowed.
 */
function emitCatalog(outPath) {
  function buildEntry(dir) {
    const meta = PARSED.get(dir);
    if (!meta) return null;

    const entry = {
      id: meta.id,
      name: meta.name,
      category: meta.category,
      complexity: meta.complexity,
      description: meta.description,
      dir,
      tier_files: resolveTierFiles(dir, meta),
    };

    // Optional pass-through fields. Preserve order: evolution chain, composition,
    // prerequisites, tags, then cost/latency tiers (matches the README ordering).
    if (meta.evolvesFrom) entry.evolvesFrom = meta.evolvesFrom;
    if (meta.evolvesInto) entry.evolvesInto = meta.evolvesInto;
    if (meta.composableWith) entry.composableWith = meta.composableWith;
    if (meta.requires) entry.requires = meta.requires;
    if (meta.tags) entry.tags = meta.tags;
    if (meta.costTier) entry.costTier = meta.costTier;
    if (meta.latencyTier) entry.latencyTier = meta.latencyTier;
    if (meta.appliesTo) entry.appliesTo = meta.appliesTo;

    const extras = detectExtras(dir);
    if (Object.keys(extras).length > 0) entry.extras = extras;

    return entry;
  }

  const patterns = PATTERN_DIRS.map(buildEntry).filter(Boolean);
  const primitives = PRIMITIVE_DIRS.map(buildEntry).filter(Boolean);
  const modifiers = MODIFIER_DIRS.map(buildEntry).filter(Boolean);

  // Sort for determinism within each cohort.
  patterns.sort((a, b) => a.id.localeCompare(b.id));
  primitives.sort((a, b) => a.id.localeCompare(b.id));
  modifiers.sort((a, b) => a.id.localeCompare(b.id));

  // Derived workflows[] view: patterns[] entries whose category is 'workflow'.
  // Kept under its own top-level key so existing consumers (older
  // agent-deployments / agent-scaffold builds) keep reading what they expect
  // while they migrate to walking patterns[] + filtering by category.
  const workflows = patterns.filter((p) => p.category === 'workflow');

  const compositions = parseCompositionMatrix();

  const catalog = {
    schema_version: SCHEMA_VERSION,
    generator_version: GENERATOR_VERSION,
    patterns,
    workflows,
    primitives,
    modifiers,
    compositions,
  };

  writeFileSync(outPath, renderYaml(catalog) + '\n', 'utf-8');
  console.log(
    `Wrote ${outPath} (${patterns.length} patterns including ${workflows.length} workflows, ` +
      `${primitives.length} primitives, ${modifiers.length} modifiers, ${compositions.length} compositions)`,
  );
}

/**
 * Resolve which tier files actually exist for this pattern. We start from the
 * `tiers` array in metadata.json (declarative source of truth) and check disk
 * presence to catch drift between metadata and filesystem.
 */
function resolveTierFiles(dir, meta) {
  const result = {};
  const declared = new Set(meta.tiers || []);
  for (const tier of TIER_FILE_NAMES) {
    if (!declared.has(tier)) continue;
    const rel = `${dir}/${tier}.md`;
    if (existsSync(join(ROOT, rel))) {
      result[tier] = rel;
    }
  }
  return result;
}

/**
 * Detect which optional companion subdirs exist (prompts/, schemas/, code/,
 * examples/). Reported as `extras: {prompts: <rel>, ...}` — best-effort
 * presence reporting; consumers must not assume an extra exists from one
 * pattern just because a sibling has it.
 */
function detectExtras(dir) {
  const result = {};
  for (const name of EXTRA_SUBDIRS) {
    const rel = `${dir}/${name}`;
    const abs = join(ROOT, rel);
    if (existsSync(abs) && statSync(abs).isDirectory()) {
      result[name] = `${rel}/`;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Composition matrix parser
// ---------------------------------------------------------------------------

/**
 * Build a name → id map from the parsed metadata. The combination matrix uses
 * display names ("Prompt Chaining", "Plan & Execute"); the catalog uses ids
 * ("prompt-chaining", "plan_and_execute"). This is the bridge.
 */
function buildNameToIdMap() {
  const map = new Map();
  for (const meta of PARSED.values()) {
    if (meta && meta.name && meta.id) {
      map.set(meta.name, meta.id);
    }
  }
  return map;
}

/**
 * Parse the combination matrix markdown into a flat list of composition edges.
 *
 * The matrix has three tables — Workflow+Workflow, Workflow+Agent, Agent+Agent.
 * Each cell is one of:
 *   - "N/A"             — self-pair, skip
 *   - "—"               — no relationship, skip
 *   - "Evolves into"    — evolution edge, already in metadata.evolvesFrom/Into; skip
 *   - "**<Kind>** — <rationale>" — composition edge, emit
 *   - "**<Kind>**"      — composition edge with no rationale, emit
 *
 * Kinds map to lowercase ids: natural, useful, complex, redundant, anti.
 * "Anti" doesn't appear in the matrix itself but in the "Combinations to Avoid"
 * section. v1 only parses the three tables; the avoid-section is a future PR.
 */
function parseCompositionMatrix() {
  const path = join(ROOT, COMPOSITION_MATRIX_PATH);
  if (!existsSync(path)) {
    console.warn(`warning: ${COMPOSITION_MATRIX_PATH} not found; emitting empty compositions[]`);
    return [];
  }
  const text = readFileSync(path, 'utf-8');
  const nameToId = buildNameToIdMap();
  const edges = [];
  const seen = new Set(); // dedupe undirected pairs

  // Split into sections at H2 headers; only parse sections whose heading
  // contains "Combinations". This skips the "Reading the Matrix" intro,
  // "Top Recommended Combinations" prose, and the avoid section.
  const sections = text.split(/^## /m).slice(1);
  for (const section of sections) {
    const firstNewline = section.indexOf('\n');
    const heading = section.slice(0, firstNewline);
    if (!/Combinations/i.test(heading)) continue;

    const tables = extractTables(section);
    for (const table of tables) {
      const rows = parseMarkdownTable(table);
      if (rows.length < 2) continue;
      const header = rows[0];
      // Header[0] is empty (the corner cell). Columns 1..N are pattern names
      // (possibly wrapped in **bold** or with arrows like "Workflow ↓ / Agent →").
      const colNames = header.slice(1).map(cleanHeaderName);
      for (const row of rows.slice(1)) {
        const rowName = cleanHeaderName(row[0]);
        const rowId = nameToId.get(rowName);
        if (!rowId) continue;
        for (let i = 0; i < colNames.length; i++) {
          const colId = nameToId.get(colNames[i]);
          if (!colId) continue;
          if (rowId === colId) continue;
          const cell = (row[i + 1] || '').trim();
          const edge = parseCell(cell);
          if (!edge) continue;
          // Dedupe undirected pair — keep first encountered.
          const key = [rowId, colId].sort().join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push({ a: rowId < colId ? rowId : colId, b: rowId < colId ? colId : rowId, ...edge });
        }
      }
    }
  }
  edges.sort((x, y) => (x.a + x.b).localeCompare(y.a + y.b));
  return edges;
}

function extractTables(section) {
  const tables = [];
  const lines = section.split('\n');
  let current = [];
  for (const line of lines) {
    if (line.trim().startsWith('|')) {
      current.push(line);
    } else if (current.length > 0) {
      tables.push(current.join('\n'));
      current = [];
    }
  }
  if (current.length > 0) tables.push(current.join('\n'));
  // A valid table has at least a header row + separator + 1 data row.
  return tables.filter((t) => t.split('\n').length >= 3);
}

function parseMarkdownTable(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    // Skip the separator row (|---|---|).
    if (/^\s*\|[\s|:-]+\|\s*$/.test(line)) continue;
    const cells = line
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim());
    rows.push(cells);
  }
  return rows;
}

function cleanHeaderName(raw) {
  return raw
    .replace(/\*\*/g, '')
    .replace(/[↓→].*$/, '') // strip directional annotations like "Workflow ↓ / Agent →"
    .replace(/^.*\//, '') // if "X / Y" remains, take the second half
    .trim();
}

function parseCell(cell) {
  if (!cell || cell === '—' || cell === '-' || /^N\/A$/i.test(cell)) return null;
  if (/^Evolves into$/i.test(cell)) return null; // captured in metadata.evolvesFrom/Into
  // Match "**Kind**" optionally followed by " — rationale" or " - rationale".
  const m = cell.match(/^\*\*([A-Za-z]+)\*\*\s*(?:[—-]\s*(.+))?$/);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const rationale = m[2] ? m[2].trim() : null;
  if (!['natural', 'useful', 'complex', 'redundant', 'anti'].includes(kind)) return null;
  return rationale ? { kind, rationale } : { kind };
}

// ---------------------------------------------------------------------------
// Tiny YAML emitter
// ---------------------------------------------------------------------------
//
// Handles: strings (quoted only when ambiguous), numbers, booleans, null,
// arrays (block style), maps (block style), and inline objects for the
// compositions block. Deliberately not a full YAML 1.2 implementation —
// only the subset this generator produces. Output is line-stable.

function renderYaml(obj) {
  return renderMap(obj, 0);
}

function indent(n) {
  return '  '.repeat(n);
}

function renderMap(obj, depth) {
  const lines = [];
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    lines.push(renderEntry(key, value, depth));
  }
  return lines.join('\n');
}

function renderEntry(key, value, depth) {
  if (value === null || value === undefined) {
    return `${indent(depth)}${key}: null`;
  }
  if (typeof value === 'string') {
    return `${indent(depth)}${key}: ${quoteString(value)}`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return `${indent(depth)}${key}: ${value}`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${indent(depth)}${key}: []`;
    }
    return `${indent(depth)}${key}:\n${renderArray(value, depth + 1)}`;
  }
  if (typeof value === 'object') {
    if (Object.keys(value).length === 0) {
      return `${indent(depth)}${key}: {}`;
    }
    return `${indent(depth)}${key}:\n${renderMap(value, depth + 1)}`;
  }
  throw new Error(`unsupported value type for ${key}: ${typeof value}`);
}

function renderArray(arr, depth) {
  return arr
    .map((item) => {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        // Inline flow style if the object has only scalar values; this keeps
        // composition edges compact: `- {a: rag, b: react, kind: natural, ...}`.
        if (canRenderInline(item)) {
          return `${indent(depth)}- ${renderInlineMap(item)}`;
        }
        const inner = renderMap(item, depth + 1);
        // The first key replaces the `- ` prefix; subsequent keys nest under it.
        const innerLines = inner.split('\n');
        innerLines[0] = innerLines[0].replace(indent(depth + 1), `${indent(depth)}- `);
        return innerLines.join('\n');
      }
      if (typeof item === 'string') {
        return `${indent(depth)}- ${quoteString(item)}`;
      }
      return `${indent(depth)}- ${item}`;
    })
    .join('\n');
}

function canRenderInline(obj) {
  for (const v of Object.values(obj)) {
    if (v !== null && typeof v === 'object') return false;
  }
  return true;
}

function renderInlineMap(obj) {
  const parts = [];
  for (const key of Object.keys(obj)) {
    parts.push(`${key}: ${renderInlineScalar(obj[key])}`);
  }
  return `{${parts.join(', ')}}`;
}

function renderInlineScalar(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return quoteString(value, true);
  return String(value);
}

// String quoting. Quote when the value contains chars that would confuse the
// YAML parser, when it parses as a reserved word, or when it starts with a
// character YAML interprets specially. (YAML_RESERVED + SAFE_BARE_RE are
// declared near the top of the file so they're initialized before
// emitCatalog runs.)
function quoteString(s, inline) {
  if (s === '') return "''";
  if (YAML_RESERVED.has(s.toLowerCase())) return JSON.stringify(s);
  if (/^[-0-9]/.test(s) && !isNaN(Number(s))) return JSON.stringify(s);
  if (inline && s.includes(',')) return JSON.stringify(s);
  if (inline && s.includes('}')) return JSON.stringify(s);
  if (SAFE_BARE_RE.test(s)) return s;
  // JSON quoting handles backslashes, quotes, control chars correctly.
  return JSON.stringify(s);
}
