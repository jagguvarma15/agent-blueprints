#!/usr/bin/env node
/**
 * Generates `website/src/data/patterns.ts` from `patterns-catalog.yaml`.
 *
 * Reads the canonical catalog (which itself is derived from per-entry
 * metadata.json files via `meta/validate-metadata.js --emit`) and re-emits
 * the website's typed pattern data. Output is line-stable so the docs-drift
 * CI gate can byte-diff.
 *
 * Run from the repo root:
 *   node meta/generate-website-data.js
 *
 * The output file at website/src/data/patterns.ts is GENERATED — do not
 * edit it by hand. Edit per-entry metadata.json files and rerun this script.
 *
 * Field mapping per entry from catalog to website TS:
 *   id, name, description, complexity, category  → pass-through
 *   slug                                          → derived: hyphenated lower form of id
 *   kind                                          → derived from cohort: 'pattern' | 'primitive' | 'modifier'
 *   evolvesFrom, evolvesInto, appliesTo           → pass-through
 *
 * Latency / cost / bestFor / requires / composableWith for the
 * PATTERN_COMPARISONS table are sourced from the catalog where present and
 * fall back to derived defaults; see buildComparison() for the rules.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '..');
const CATALOG_PATH = join(ROOT, 'patterns-catalog.yaml');
const TAXONOMY_PATH = join(ROOT, 'taxonomy.yaml');
const OUTPUT_PATH = join(ROOT, 'website/src/data/patterns.ts');

// ---------------------------------------------------------------------------
// Load + classify
// ---------------------------------------------------------------------------

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

// Map cohort id → 'pattern' | 'primitive' | 'modifier' kind discriminator.
// Today the convention is: cohort.id ∈ {patterns} → pattern; ∈ {primitives} →
// primitive; ∈ {modifiers} → modifier. We derive this from the cohort id by
// taking its singular form (dropping trailing 's'). New cohorts get the same
// treatment automatically.
function cohortKind(cohort) {
  const s = cohort.id;
  return s.endsWith('s') ? s.slice(0, -1) : s;
}

// Map cohort id → catalog top-level key. Each cohort declares this in
// taxonomy.yaml as `catalog_key`.
const COHORT_BY_CATALOG_KEY = new Map();
for (const cohort of TAXONOMY.cohorts) {
  COHORT_BY_CATALOG_KEY.set(cohort.catalog_key, cohort);
}

// ---------------------------------------------------------------------------
// Per-entry display field defaults — historical PATTERN_COMPARISONS data
// that didn't make it into per-entry metadata.json. Keyed by id. Edit
// per-entry metadata.json eventually and remove these.
//
// Until that migration: the website generator falls back to these values
// when the catalog entry doesn't carry the field.
// ---------------------------------------------------------------------------
const COMPARISON_DEFAULTS = {
  'prompt-chaining': { latency: 'Medium', cost: 'Low', bestFor: 'Sequential, predictable transformations' },
  'parallel-calls': { latency: 'Low', cost: 'Medium', bestFor: 'Independent sub-tasks, aggregated results' },
  'orchestrator-worker': { latency: 'Medium', cost: 'Medium', bestFor: 'Complex tasks with dynamic decomposition' },
  'evaluator-optimizer': { latency: 'High', cost: 'High', bestFor: 'Quality-sensitive outputs needing iteration' },
  react: { latency: 'Variable', cost: 'Medium', bestFor: 'Open-ended tasks requiring tool use' },
  plan_and_execute: { latency: 'High', cost: 'High', bestFor: 'Complex multi-step tasks needing upfront planning' },
  tool_use: { latency: 'Low', cost: 'Low', bestFor: 'Structured API calls and function execution' },
  memory: { latency: 'Medium', cost: 'Medium', bestFor: 'Sessions requiring context persistence' },
  rag: { latency: 'Medium', cost: 'Medium', bestFor: 'Knowledge-intensive Q&A and generation' },
  reflection: { latency: 'High', cost: 'High', bestFor: 'High-quality outputs needing self-critique' },
  routing: { latency: 'Low', cost: 'Low', bestFor: 'Multi-intent systems with specialized handlers' },
  multi_agent: { latency: 'High', cost: 'High', bestFor: 'Enterprise systems with parallel specialization' },
  event_driven: { latency: 'Medium', cost: 'Medium', bestFor: 'Async reactive systems on a queue or stream' },
  saga: { latency: 'High', cost: 'Medium', bestFor: 'Long-running workflows requiring compensation on failure' },
  human_in_the_loop: { latency: 'Variable', cost: 'Low', bestFor: 'High-stakes actions requiring human approval or correction' },
  skills: { latency: 'Low', cost: 'Low', bestFor: 'Repeatable in-context procedures the agent should perform consistently across runs' },
  sub_agents: { latency: 'Medium', cost: 'Medium', bestFor: 'Delegating bounded sub-tasks to role-scoped agent instances' },
  guardrails: { latency: 'Medium', cost: 'Medium', bestFor: 'Layered policy checks plus a dual-LLM split against prompt injection' },
  long_horizon: { latency: 'High', cost: 'High', bestFor: 'Tasks that span hours to weeks with checkpoint-and-resume across deploys' },
  agentic_rag: { latency: 'High', cost: 'Medium', bestFor: 'Compound or multi-source questions where grounding and citations matter' },
};

// ---------------------------------------------------------------------------
// Slug + kind helpers
// ---------------------------------------------------------------------------

function slugFor(id) {
  // The website uses hyphenated slugs (e.g. plan_and_execute → plan-and-execute).
  return id.replace(/_/g, '-');
}

function categoryFor(catalogEntry, cohortKindName) {
  // Patterns use 'agent' or 'workflow'. Primitives + modifiers use their kind
  // name as the website-side category to keep the discriminator aligned.
  if (cohortKindName === 'pattern') return catalogEntry.category;
  return cohortKindName;
}

// ---------------------------------------------------------------------------
// TS emit
// ---------------------------------------------------------------------------

function tsStringLiteral(s) {
  return `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function tsStringList(items) {
  return `[${items.map(tsStringLiteral).join(', ')}]`;
}

function emitEntry(entry, cohortKindName) {
  const lines = [`  {`];
  lines.push(`    id: ${tsStringLiteral(entry.id)},`);
  lines.push(`    name: ${tsStringLiteral(entry.name)},`);
  lines.push(`    slug: ${tsStringLiteral(slugFor(entry.id))},`);
  lines.push(`    description: ${tsStringLiteral(entry.description)},`);
  lines.push(`    complexity: ${tsStringLiteral(entry.complexity)},`);
  lines.push(`    category: ${tsStringLiteral(categoryFor(entry, cohortKindName))},`);
  lines.push(`    kind: ${tsStringLiteral(cohortKindName)},`);
  if (entry.evolvesFrom?.length) {
    lines.push(`    evolvesFrom: ${tsStringList(entry.evolvesFrom)},`);
  }
  if (entry.evolvesInto?.length) {
    lines.push(`    evolvesInto: ${tsStringList(entry.evolvesInto)},`);
  }
  if (entry.appliesTo?.length) {
    lines.push(`    appliesTo: ${tsStringList(entry.appliesTo)},`);
  }
  lines.push(`  },`);
  return lines.join('\n');
}

function emitComparison(entry, cohortKindName) {
  const def = COMPARISON_DEFAULTS[entry.id] || {};
  const latency = def.latency || 'Variable';
  const cost = def.cost || 'Variable';
  const bestFor = def.bestFor || entry.description || '';
  const requires = entry.requires || [];
  const composableWith = entry.composableWith || [];
  const lines = [`  {`];
  lines.push(`    id: ${tsStringLiteral(entry.id)},`);
  lines.push(`    name: ${tsStringLiteral(entry.name)},`);
  lines.push(`    category: ${tsStringLiteral(categoryFor(entry, cohortKindName))},`);
  lines.push(`    complexity: ${tsStringLiteral(entry.complexity)},`);
  lines.push(`    latency: ${tsStringLiteral(latency)},`);
  lines.push(`    cost: ${tsStringLiteral(cost)},`);
  lines.push(`    bestFor: ${tsStringLiteral(bestFor)},`);
  lines.push(`    requires: ${tsStringList(requires)},`);
  lines.push(`    composableWith: ${tsStringList(composableWith)},`);
  lines.push(`  },`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Assemble TS file
// ---------------------------------------------------------------------------

function generate() {
  // Build cohort buckets keyed by catalog_key.
  const buckets = {};
  for (const cohort of TAXONOMY.cohorts) {
    buckets[cohort.catalog_key] = CATALOG[cohort.catalog_key] || [];
  }
  // Patterns split into workflows + agent patterns for the website's WORKFLOWS
  // and AGENT_PATTERNS arrays.
  const patterns = buckets.patterns || [];
  const workflows = patterns.filter((p) => p.category === 'workflow');
  const agentPatterns = patterns.filter((p) => p.category === 'agent');
  const primitives = buckets.primitives || [];
  const modifiers = buckets.modifiers || [];

  // Stable order: catalog already returns them sorted by id. Keep that.

  const header = `/**
 * Pattern metadata for the website. GENERATED FILE — do not edit by hand.
 *
 * Source of truth: per-entry metadata.json files under patterns/, primitives/,
 * and modifiers/, aggregated via meta/validate-metadata.js into
 * patterns-catalog.yaml. This TypeScript module is regenerated by
 * meta/generate-website-data.js.
 *
 * To add or modify an entry:
 *   1. Edit the relevant metadata.json (and any tier .md files) under
 *      patterns/, primitives/, or modifiers/.
 *   2. Run: node meta/validate-metadata.js --emit patterns-catalog.yaml
 *   3. Run: node meta/generate-website-data.js
 *   4. Commit all three changes (metadata.json, patterns-catalog.yaml, and
 *      this generated TS file).
 *
 * See meta/HOW_TO_ADD_AN_ENTRY.md for the full contributor walkthrough.
 */

export type Complexity = 'Beginner' | 'Intermediate' | 'Advanced';
export type Category = 'workflow' | 'agent' | 'primitive' | 'modifier';
export type Kind = 'pattern' | 'primitive' | 'modifier';

export interface PatternMeta {
  id: string;
  name: string;
  slug: string;
  description: string;
  complexity: Complexity;
  category: Category;
  /** Which cohort this entry belongs to — drives website routing. */
  kind: Kind;
  /** For agent patterns: the workflow(s) this evolves from */
  evolvesFrom?: string[];
  /** Agent patterns that evolve FROM this workflow (for workflow patterns) */
  evolvesInto?: string[];
  /** For modifiers: which patterns this can be layered on (or ['any']) */
  appliesTo?: string[];
}
`;

  const sections = [];

  sections.push(
    `// ---------------------------------------------------------------------------
// Workflows (kept as a named subset of patterns for backward compat — same
// entries also appear in the unified patterns/ catalog directory).
// ---------------------------------------------------------------------------

export const WORKFLOWS: PatternMeta[] = [
${workflows.map((p) => emitEntry(p, 'pattern')).join('\n')}
];`,
  );

  sections.push(
    `// ---------------------------------------------------------------------------
// Agent patterns — LLM-controlled flow shapes.
// ---------------------------------------------------------------------------

export const AGENT_PATTERNS: PatternMeta[] = [
${agentPatterns.map((p) => emitEntry(p, 'pattern')).join('\n')}
];`,
  );

  sections.push(
    `// ---------------------------------------------------------------------------
// Primitives — building blocks the agent uses. Orthogonal to patterns.
// ---------------------------------------------------------------------------

export const PRIMITIVES: PatternMeta[] = [
${primitives.map((p) => emitEntry(p, 'primitive')).join('\n')}
];`,
  );

  sections.push(
    `// ---------------------------------------------------------------------------
// Modifiers — transformations layered on a pattern.
// ---------------------------------------------------------------------------

export const MODIFIERS: PatternMeta[] = [
${modifiers.map((p) => emitEntry(p, 'modifier')).join('\n')}
];`,
  );

  sections.push(
    `// ---------------------------------------------------------------------------
// Lookups (any of patterns + primitives + modifiers).
// ---------------------------------------------------------------------------

export const ALL_PATTERNS: PatternMeta[] = [
  ...WORKFLOWS,
  ...AGENT_PATTERNS,
  ...PRIMITIVES,
  ...MODIFIERS,
];

export function getPatternById(id: string): PatternMeta | undefined {
  return ALL_PATTERNS.find((p) => p.id === id);
}

export function getWorkflowById(id: string): PatternMeta | undefined {
  return WORKFLOWS.find((p) => p.id === id);
}

export function getAgentPatternById(id: string): PatternMeta | undefined {
  return AGENT_PATTERNS.find((p) => p.id === id);
}

export function getPrimitiveById(id: string): PatternMeta | undefined {
  return PRIMITIVES.find((p) => p.id === id);
}

export function getModifierById(id: string): PatternMeta | undefined {
  return MODIFIERS.find((p) => p.id === id);
}

/** Evolution edges: workflow → agent patterns (only) */
export const EVOLUTION_EDGES = AGENT_PATTERNS.flatMap((ap) =>
  (ap.evolvesFrom ?? []).map((wfId) => ({ source: wfId, target: ap.id })),
);

/** Comparison data for /compare/ */
export interface PatternComparison {
  id: string;
  name: string;
  category: Category;
  complexity: Complexity;
  latency: 'Low' | 'Medium' | 'High' | 'Variable';
  cost: 'Low' | 'Medium' | 'High' | 'Variable';
  bestFor: string;
  requires: string[];
  composableWith: string[];
}

export const PATTERN_COMPARISONS: PatternComparison[] = [
${[
  ...patterns.map((p) => emitComparison(p, 'pattern')),
  ...primitives.map((p) => emitComparison(p, 'primitive')),
  ...modifiers.map((p) => emitComparison(p, 'modifier')),
].join('\n')}
];`,
  );

  // -----------------------------------------------------------------------
  // Compositions — the catalog's top-level edge list. Powers the network viz.
  // -----------------------------------------------------------------------
  const compositions = CATALOG.compositions || [];
  sections.push(
    `// ---------------------------------------------------------------------------
// Composition edges — every documented pairing between two entries with a
// 'kind' label and a one-line rationale. Sourced from
// patterns-catalog.yaml#compositions.
// ---------------------------------------------------------------------------

export type CompositionKind = 'natural' | 'useful' | 'complex' | 'redundant';

export interface CompositionEdge {
  a: string;
  b: string;
  kind: CompositionKind;
  rationale: string;
}

export const COMPOSITIONS: CompositionEdge[] = [
${compositions
  .map(
    (c) =>
      `  { a: ${tsStringLiteral(c.a)}, b: ${tsStringLiteral(c.b)}, kind: ${tsStringLiteral(
        c.kind,
      )}, rationale: ${tsStringLiteral(c.rationale)} },`,
  )
  .join('\n')}
];`,
  );

  const body = `${header}\n${sections.join('\n\n')}\n`;
  return body;
}

const output = generate();
writeFileSync(OUTPUT_PATH, output, 'utf-8');
console.log(`Wrote ${OUTPUT_PATH}`);
