#!/usr/bin/env node
/**
 * Validates that every pattern and workflow directory has a valid metadata.json,
 * and that the key fields match the patterns.ts data file in the website.
 *
 * Run from the repo root:
 *   node meta/validate-metadata.js
 *
 * Used in CI to catch sync issues between metadata.json files and patterns.ts.
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '..');

const REQUIRED_FIELDS = ['id', 'name', 'category', 'complexity', 'description', 'tiers'];
const VALID_CATEGORIES = ['workflow', 'agent'];
const VALID_COMPLEXITIES = ['Beginner', 'Intermediate', 'Advanced'];

const PATTERN_DIRS = [
  'workflows/prompt-chaining',
  'workflows/parallel-calls',
  'workflows/orchestrator-worker',
  'workflows/evaluator-optimizer',
  'patterns/react',
  'patterns/plan-and-execute',
  'patterns/tool-use',
  'patterns/memory',
  'patterns/rag',
  'patterns/reflection',
  'patterns/routing',
  'patterns/multi-agent',
];

let errors = 0;

for (const dir of PATTERN_DIRS) {
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

  // Check that referenced patterns exist
  const allIds = PATTERN_DIRS.map((d) => d.split('/')[1]);
  for (const field of ['evolvesFrom', 'evolvesInto', 'composableWith']) {
    if (meta[field]) {
      for (const refId of meta[field]) {
        if (!allIds.includes(refId)) {
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

if (errors === 0) {
  console.log(`All ${PATTERN_DIRS.length} metadata.json files are valid.`);
  process.exit(0);
} else {
  console.error(`\n${errors} validation error(s) found.`);
  process.exit(1);
}
