#!/usr/bin/env node
/**
 * Validates every cohort entry's metadata.json against the contract declared
 * in `taxonomy.yaml`, and emits `patterns-catalog.yaml` from the validated
 * data when `--emit <path>` is supplied.
 *
 * Cohorts are NOT hardcoded — they're read from `taxonomy.yaml`. Adding a new
 * cohort means adding one entry to taxonomy.yaml + creating its directory; no
 * code change here.
 *
 * Run from the repo root:
 *   node meta/validate-metadata.js
 *   node meta/validate-metadata.js --emit patterns-catalog.yaml
 *
 * See meta/HOW_TO_ADD_AN_ENTRY.md for the contributor walkthrough.
 */

import { readFileSync, existsSync, readdirSync, writeFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '..');

// --emit <path>: aggregate validated metadata into patterns-catalog.yaml.
const EMIT_FLAG_INDEX = process.argv.indexOf('--emit');
const EMIT_PATH = EMIT_FLAG_INDEX !== -1 ? process.argv[EMIT_FLAG_INDEX + 1] : null;
if (EMIT_FLAG_INDEX !== -1 && !EMIT_PATH) {
  console.error('Usage: --emit <path>');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Taxonomy load — single source of truth for which cohorts exist.
// ---------------------------------------------------------------------------

const TAXONOMY_PATH = join(ROOT, 'taxonomy.yaml');
if (!existsSync(TAXONOMY_PATH)) {
  console.error(`MISSING: ${TAXONOMY_PATH}`);
  process.exit(2);
}
const TAXONOMY = yaml.load(readFileSync(TAXONOMY_PATH, 'utf-8'));

if (!TAXONOMY || typeof TAXONOMY !== 'object') {
  console.error(`INVALID: taxonomy.yaml did not parse to an object`);
  process.exit(2);
}
if (!Array.isArray(TAXONOMY.cohorts) || TAXONOMY.cohorts.length === 0) {
  console.error(`INVALID: taxonomy.yaml must declare at least one cohort under 'cohorts:'`);
  process.exit(2);
}

const REQUIRED_FIELDS = ['id', 'name', 'category', 'complexity', 'description', 'tiers'];
const VALID_COMPLEXITIES = ['Beginner', 'Intermediate', 'Advanced'];
const TIER_FILE_NAMES = [
  'overview',
  'design',
  'implementation',
  'evolution',
  'observability',
  'cost-and-latency',
];
const EXTRA_SUBDIRS = ['prompts', 'schemas', 'code', 'examples'];
const COMPOSITION_MATRIX_PATH = 'composition/combination-matrix.md';
// YAML emitter constants — hoisted here so they're outside the temporal dead
// zone when emitCatalog() runs from the validator's success path.
const YAML_RESERVED = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~']);
const SAFE_BARE_RE = /^[A-Za-z_][A-Za-z0-9_.\-/]*$/;

// Catalog top-level constants — read from taxonomy so a single bump there
// flows everywhere.
const SCHEMA_VERSION = TAXONOMY.catalog_schema_version;
const GENERATOR_VERSION = TAXONOMY.generator_version;

// Discover each cohort's entry directories by walking taxonomy.cohorts[].dir.
// An entry is any non-hidden subdirectory containing a metadata.json.
function discoverEntries(cohort) {
  const dir = cohort.dir;
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .filter((e) => existsSync(join(abs, e.name, 'metadata.json')))
    .map((e) => `${dir}/${e.name}`)
    .sort();
}

// `cohorts` is the in-memory join of taxonomy.cohorts[] + discovered entry
// directories. Each element is { cohort: <taxonomyEntry>, entries: [dir, ...] }.
const COHORTS = TAXONOMY.cohorts.map((cohort) => ({
  cohort,
  entries: discoverEntries(cohort),
}));

const ALL_DIRS = COHORTS.flatMap((c) => c.entries);
const ALL_IDS = new Set(ALL_DIRS.map((d) => d.split('/').pop()));

// Per-dir expected category list (sourced from the cohort declaration).
const EXPECTED_CATEGORY_BY_DIR = new Map();
for (const { cohort, entries } of COHORTS) {
  for (const dir of entries) {
    EXPECTED_CATEGORY_BY_DIR.set(dir, cohort.category_values);
  }
}

// Per-entry valid category set (any cohort's allowed values).
const ALL_VALID_CATEGORIES = new Set(
  TAXONOMY.cohorts.flatMap((c) => c.category_values),
);

// ---------------------------------------------------------------------------
// Validation loop
// ---------------------------------------------------------------------------

let errors = 0;
const PARSED = new Map();

for (const dir of ALL_DIRS) {
  const metaPath = join(ROOT, dir, 'metadata.json');
  let meta;
  try {
    meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
  } catch (e) {
    console.error(`INVALID JSON: ${dir}/metadata.json — ${e.message}`);
    errors++;
    continue;
  }
  PARSED.set(dir, meta);

  // Required-field check.
  for (const field of REQUIRED_FIELDS) {
    if (!(field in meta)) {
      console.error(`MISSING FIELD "${field}": ${dir}/metadata.json`);
      errors++;
    }
  }

  // Category value check (global set + per-cohort set).
  if (meta.category && !ALL_VALID_CATEGORIES.has(meta.category)) {
    console.error(`INVALID category "${meta.category}": ${dir}/metadata.json`);
    errors++;
  }
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

  // ID ↔ directory-name coherence.
  const expectedId = dir.split('/').pop();
  if (meta.id !== expectedId) {
    console.error(`ID MISMATCH: expected "${expectedId}", got "${meta.id}" in ${dir}/metadata.json`);
    errors++;
  }

  // Cross-cohort reference check (evolvesFrom, composableWith, appliesTo).
  for (const field of ['evolvesFrom', 'evolvesInto', 'composableWith', 'appliesTo']) {
    if (meta[field]) {
      for (const refId of meta[field]) {
        if (refId === 'any') continue; // wildcard for modifier.appliesTo
        if (!ALL_IDS.has(refId)) {
          console.error(`UNKNOWN REF "${refId}" in ${field}: ${dir}/metadata.json`);
          errors++;
        }
      }
    }
  }

  // Tier-file presence.
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

// Cross-check that every entry id is registered in the website data file.
// website/src/data/patterns.ts is a generated artifact (see
// meta/generate-website-data.js), so this catches a forgotten regen as well
// as a hand-edit that diverges.
const SITE_DATA_PATH = join(ROOT, 'website/src/data/patterns.ts');
if (existsSync(SITE_DATA_PATH)) {
  const siteData = readFileSync(SITE_DATA_PATH, 'utf-8');
  for (const dir of ALL_DIRS) {
    const id = dir.split('/').pop();
    if (!siteData.includes(`id: '${id}'`) && !siteData.includes(`id: "${id}"`)) {
      console.error(
        `MISSING FROM SITE DATA: "${id}" is in metadata but not registered in website/src/data/patterns.ts ` +
          `(run: node meta/generate-website-data.js)`,
      );
      errors++;
    }
  }
} else {
  console.error(`MISSING FILE: ${SITE_DATA_PATH}`);
  errors++;
}

if (errors === 0) {
  const counts = COHORTS.map((c) => `${c.entries.length} ${c.cohort.label_plural || c.cohort.id}`).join(' + ');
  console.log(`All ${ALL_DIRS.length} metadata.json files are valid (${counts}).`);
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
 * Aggregate per-entry metadata + tier-file paths + composition matrix into
 * a deterministic YAML catalog. No timestamps, no commit SHAs — output is a
 * pure function of the source files so drift CI can byte-diff.
 *
 * Catalog shape is taxonomy-driven: one top-level key per cohort (using the
 * cohort's `catalog_key`), plus derived views per `taxonomy.derived_views`.
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

    // Optional pass-through fields. Order matches the README convention.
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

  // Build per-cohort buckets indexed by catalog_key.
  const cohortBuckets = {};
  for (const { cohort, entries } of COHORTS) {
    const items = entries.map(buildEntry).filter(Boolean);
    items.sort((a, b) => a.id.localeCompare(b.id));
    cohortBuckets[cohort.catalog_key] = items;
  }

  // Derived views: filter another cohort by a predicate.
  const derivedViews = TAXONOMY.derived_views || [];
  for (const view of derivedViews) {
    const sourceCohort = TAXONOMY.cohorts.find((c) => c.id === view.source);
    if (!sourceCohort) {
      console.warn(`warning: derived_views[].source "${view.source}" matches no cohort id; skipping`);
      continue;
    }
    const source = cohortBuckets[sourceCohort.catalog_key] || [];
    cohortBuckets[view.catalog_key] = source.filter((entry) => evaluatePredicate(view.filter, entry));
  }

  const compositions = parseCompositionMatrix();

  // Assemble catalog in declaration order: schema_version first, then each
  // cohort's catalog_key, then derived views' catalog_keys, then compositions.
  const catalog = {
    schema_version: SCHEMA_VERSION,
    generator_version: GENERATOR_VERSION,
  };
  for (const { cohort } of COHORTS) {
    catalog[cohort.catalog_key] = cohortBuckets[cohort.catalog_key];
  }
  for (const view of derivedViews) {
    catalog[view.catalog_key] = cohortBuckets[view.catalog_key];
  }
  catalog.compositions = compositions;

  writeFileSync(outPath, renderYaml(catalog) + '\n', 'utf-8');

  // Summary log mirrors the validator's count line for readability.
  const summary = COHORTS.map((c) => {
    const items = cohortBuckets[c.cohort.catalog_key];
    return `${items.length} ${c.cohort.label_plural || c.cohort.id}`;
  }).join(', ');
  const derivedSummary = derivedViews.length
    ? `, derived: ${derivedViews
        .map((v) => `${v.catalog_key}=${(cohortBuckets[v.catalog_key] || []).length}`)
        .join(', ')}`
    : '';
  console.log(`Wrote ${outPath} (${summary}${derivedSummary}, ${compositions.length} compositions)`);
}

/**
 * Tiny predicate evaluator for `requires_state_schema.when` and
 * `derived_views[].filter` expressions. Supported forms:
 *   - "true"
 *   - "false"
 *   - "category == 'X'"
 *   - "category != 'X'"
 *
 * Extend here as new shapes are needed; keep the grammar minimal so the
 * taxonomy.schema.json regex doesn't get unwieldy.
 */
function evaluatePredicate(expr, entry) {
  const trimmed = (expr || '').trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  const m = trimmed.match(/^category\s*(==|!=)\s*'([a-zA-Z][a-zA-Z0-9_-]*)'$/);
  if (m) {
    const op = m[1];
    const value = m[2];
    if (op === '==') return entry.category === value;
    return entry.category !== value;
  }
  throw new Error(`unsupported expression: ${expr}`);
}

/**
 * Resolve which tier files actually exist for this entry. Starts from the
 * declarative `tiers` array in metadata.json and checks disk presence.
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
 * entry just because a sibling has it.
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

function buildNameToIdMap() {
  const map = new Map();
  for (const meta of PARSED.values()) {
    if (meta && meta.name && meta.id) {
      map.set(meta.name, meta.id);
    }
  }
  return map;
}

function parseCompositionMatrix() {
  const path = join(ROOT, COMPOSITION_MATRIX_PATH);
  if (!existsSync(path)) {
    console.warn(`warning: ${COMPOSITION_MATRIX_PATH} not found; emitting empty compositions[]`);
    return [];
  }
  const text = readFileSync(path, 'utf-8');
  const nameToId = buildNameToIdMap();
  const edges = [];
  const seen = new Set();

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
  return tables.filter((t) => t.split('\n').length >= 3);
}

function parseMarkdownTable(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
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
    .replace(/[↓→].*$/, '')
    .replace(/^.*\//, '')
    .trim();
}

function parseCell(cell) {
  if (!cell || cell === '—' || cell === '-' || /^N\/A$/i.test(cell)) return null;
  if (/^Evolves into$/i.test(cell)) return null;
  const m = cell.match(/^\*\*([A-Za-z]+)\*\*\s*(?:[—-]\s*(.+))?$/);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const rationale = m[2] ? m[2].trim() : null;
  if (!['natural', 'useful', 'complex', 'redundant', 'anti'].includes(kind)) return null;
  return rationale ? { kind, rationale } : { kind };
}

// ---------------------------------------------------------------------------
// Tiny YAML emitter — handles strings, numbers, booleans, null, arrays
// (block style), maps (block style), and inline objects. Output is
// line-stable so the drift CI can byte-diff.
// YAML_RESERVED + SAFE_BARE_RE are declared near the top of the file (TDZ
// avoidance — emitCatalog runs before this section is reached).
// ---------------------------------------------------------------------------

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
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${indent(depth)}${key}: []`;
    }
    return `${indent(depth)}${key}:\n${renderArray(value, depth)}`;
  }
  if (typeof value === 'object') {
    if (Object.keys(value).length === 0) {
      return `${indent(depth)}${key}: {}`;
    }
    return `${indent(depth)}${key}:\n${renderMap(value, depth + 1)}`;
  }
  return `${indent(depth)}${key}: ${renderScalar(value)}`;
}

function renderArray(arr, depth) {
  const lines = [];
  for (const item of arr) {
    if (item === null || item === undefined) {
      lines.push(`${indent(depth)}- null`);
    } else if (Array.isArray(item)) {
      // Nested arrays — not used today, but render block-style for safety.
      lines.push(`${indent(depth)}-`);
      lines.push(renderArray(item, depth + 1));
    } else if (typeof item === 'object') {
      // For the compositions block, render inline {a: x, b: y, kind: z, rationale: "..."}
      if (isFlatScalarObject(item)) {
        lines.push(`${indent(depth)}- ${renderInlineObject(item)}`);
      } else {
        const entries = Object.entries(item);
        const [firstKey, firstVal] = entries[0];
        const firstLine = renderFirstObjectEntry(firstKey, firstVal, depth + 1);
        lines.push(`${indent(depth)}- ${firstLine}`);
        for (let i = 1; i < entries.length; i++) {
          const [k, v] = entries[i];
          lines.push(renderEntry(k, v, depth + 1));
        }
      }
    } else {
      lines.push(`${indent(depth)}- ${renderScalar(item)}`);
    }
  }
  return lines.join('\n');
}

function renderFirstObjectEntry(key, value, depth) {
  if (value === null || value === undefined) return `${key}: null`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${key}: []`;
    return `${key}:\n${renderArray(value, depth)}`;
  }
  if (typeof value === 'object') {
    if (Object.keys(value).length === 0) return `${key}: {}`;
    return `${key}:\n${renderMap(value, depth + 1)}`;
  }
  return `${key}: ${renderScalar(value)}`;
}

function isFlatScalarObject(obj) {
  return Object.values(obj).every(
    (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v),
  );
}

function renderInlineObject(obj) {
  const parts = Object.entries(obj).map(([k, v]) => `${k}: ${renderScalar(v)}`);
  return `{${parts.join(', ')}}`;
}

function renderScalar(v) {
  if (typeof v === 'string') return quoteString(v);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return JSON.stringify(v);
}

function quoteString(s) {
  if (s === '') return '""';
  if (
    SAFE_BARE_RE.test(s) &&
    !YAML_RESERVED.has(s.toLowerCase()) &&
    !/^-?\d+(\.\d+)?$/.test(s) &&
    !s.startsWith(' ') &&
    !s.endsWith(' ')
  ) {
    return s;
  }
  // Use double quotes; escape backslashes and double-quotes only.
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
