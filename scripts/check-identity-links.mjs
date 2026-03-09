#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const canonicalRepo = "https://github.com/jagguvarma15/agent-blueprints";

const disallowedPatterns = [
  /https:\/\/github\.com\/anthropics\/agent-blueprints/gi,
  /https:\/\/anthropics\.github\.io\/agent-blueprints/gi,
  /organizationName:\s*['"]anthropics['"]/g,
  /https:\/\/github\.com\/jvarma\/agent-blueprints/gi,
  /https:\/\/jvarma\.github\.io\/agent-blueprints/gi,
  /organizationName:\s*['"]jvarma['"]/g,
];

const allowedSubstrings = [
  // Legit links to Anthropic SDK docs/repos; not this project's identity.
  "https://github.com/anthropics/anthropic-sdk-python",
  "https://github.com/anthropics/anthropic-sdk-typescript",
];

const textFileExts = new Set([
  ".md",
  ".ts",
  ".js",
  ".json",
  ".yml",
  ".yaml",
  ".toml",
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === ".git" ||
      entry.name === "node_modules" ||
      entry.name === ".venv" ||
      entry.name === "dist" ||
      entry.name === "build" ||
      entry.name === ".docusaurus"
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && textFileExts.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

const offenders = [];

for (const file of walk(root)) {
  const rel = path.relative(root, file);
  const content = fs.readFileSync(file, "utf8");

  if (allowedSubstrings.some((s) => content.includes(s))) {
    // Keep checking for explicit disallowed project identity strings anyway.
  }

  for (const pattern of disallowedPatterns) {
    pattern.lastIndex = 0;
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      offenders.push(`${rel}: found disallowed identity reference (${matches[0]})`);
    }
  }
}

if (offenders.length > 0) {
  for (const line of offenders) {
    console.error(`identity-links: ${line}`);
  }
  console.error(`identity-links: expected canonical repo base: ${canonicalRepo}`);
  process.exit(1);
}

console.log("identity-links: OK");
