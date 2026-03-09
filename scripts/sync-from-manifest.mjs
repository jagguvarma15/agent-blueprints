#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "blueprints", "manifest.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function idPrefix(id) {
  return id.split("-")[0];
}

function titleCaseWord(word) {
  if (word === "rag") return "RAG";
  if (word === "react") return "ReAct";
  if (word === "and") return "&";
  if (word === "in") return "in";
  if (word === "the") return "the";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function displayName(id) {
  const withoutPrefix = id.replace(/^\d{2}-/, "");
  return withoutPrefix
    .split("-")
    .map(titleCaseWord)
    .join(" ")
    .replace(/\s+\&\s+/g, " & ");
}

function cliDescription(entry) {
  if (entry.status === "planned") {
    return `Planned ${entry.pattern} blueprint (not scaffoldable yet).`;
  }
  return `${entry.pattern} blueprint (${entry.complexity}) ready to scaffold.`;
}

function generateCliBlueprints(entries) {
  const items = entries
    .map(
      (e) => `  {
    id: '${e.id}',
    name: '${displayName(e.id)}',
    complexity: '${e.complexity}',
    pattern: '${e.pattern}',
    status: '${e.status}',
    description: '${cliDescription(e)}',
  },`,
    )
    .join("\n");

  return `export interface Blueprint {
  id: string;
  name: string;
  complexity: 'Beginner' | 'Intermediate' | 'Advanced';
  pattern: string;
  status: 'ready' | 'planned';
  description: string;
}

export const BLUEPRINTS: Blueprint[] = [
${items}
];

/**
 * Look up a blueprint by its numeric prefix or full id.
 * Accepts both "01" and "01-react-agent".
 */
export function findBlueprint(query: string): Blueprint | undefined {
  const normalised = query.toLowerCase().trim();
  return BLUEPRINTS.find(
    (b) => b.id === normalised || b.id.startsWith(normalised + '-'),
  );
}

/** Return the slug portion used as a default directory name. */
export function blueprintSlug(blueprint: Blueprint): string {
  return blueprint.id;
}
`;
}

function markdownTable(headers, rows) {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `|${headers.map(() => "---").join("|")}|`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return [head, sep, body].join("\n");
}

function generateReadmeSection(entries) {
  const ready = entries.filter((e) => e.status === "ready");
  const planned = entries.filter((e) => e.status === "planned");

  const readyRows = ready.map((e) => [
    idPrefix(e.id),
    `[${displayName(e.id)}](./blueprints/${e.id}/)`,
    e.complexity,
    e.pattern,
    e.languages.includes("python") ? `[python](./blueprints/${e.id}/python/)` : "—",
    e.languages.includes("typescript")
      ? `[typescript](./blueprints/${e.id}/typescript/)`
      : "—",
  ]);

  const plannedRows = planned.map((e) => [
    idPrefix(e.id),
    displayName(e.id),
    e.complexity,
    e.pattern,
    "Planned",
  ]);

  return `## Blueprints

### Implemented in this repo

${markdownTable(
  ["#", "Blueprint", "Complexity", "Pattern", "Python", "TypeScript"],
  readyRows,
)}

### Planned blueprints

${markdownTable(
  ["#", "Blueprint", "Complexity", "Pattern", "Status"],
  plannedRows,
)}
`;
}

function generateWebsiteBlueprintIndex(entries) {
  const ready = entries.filter((e) => e.status === "ready");
  const planned = entries.filter((e) => e.status === "planned");

  const readyRows = ready.map((e) => [
    idPrefix(e.id),
    `[${displayName(e.id)}](https://github.com/jvarma/agent-blueprints/tree/main/blueprints/${e.id})`,
    e.complexity,
    e.pattern,
    "Ready",
  ]);

  const plannedRows = planned.map((e) => [
    idPrefix(e.id),
    displayName(e.id),
    e.complexity,
    e.pattern,
    "Planned",
  ]);

  return `---
id: blueprints-index
title: Blueprints
sidebar_position: 1
description: Browse all blueprint entries and current implementation status.
---

# Blueprints

This page is generated from \`blueprints/manifest.json\`.

Implemented now: **${ready.map((e) => idPrefix(e.id)).join("/")}**  
Planned: **${planned.map((e) => idPrefix(e.id)).join("/")}**

## Scaffold any ready blueprint

\`\`\`bash
npx agent-blueprints@latest init
\`\`\`

## Ready blueprints

${markdownTable(["#", "Blueprint", "Complexity", "Pattern", "Status"], readyRows)}

## Planned blueprints

${markdownTable(["#", "Blueprint", "Complexity", "Pattern", "Status"], plannedRows)}
`;
}

function generateSidebars(entries) {
  const readyLinks = entries
    .filter((e) => e.status === "ready")
    .map(
      (e) =>
        `    {
      type: "link",
      label: "${idPrefix(e.id)} ${displayName(e.id)} (Repo)",
      href: "https://github.com/jvarma/agent-blueprints/tree/main/blueprints/${e.id}",
    },`,
    )
    .join("\n");

  return `import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docsSidebar: [{ type: "doc", id: "intro", label: "Introduction" }],
  blueprintsSidebar: [
    { type: "doc", id: "blueprints-index", label: "Overview" },
${readyLinks}
  ],
  patternsSidebar: [{ type: "doc", id: "patterns-index", label: "Overview" }],
  architecturesSidebar: [
    { type: "doc", id: "architectures-index", label: "Overview" },
  ],
};

export default sidebars;
`;
}

function replaceReadmeBlueprintSection(readme, newSection) {
  const pattern = /## Blueprints[\s\S]*?### Complexity guide/;
  ensure(pattern.test(readme), "README blueprints section not found.");
  return readme.replace(pattern, `${newSection}\n### Complexity guide`);
}

const entries = readJson(manifestPath);
ensure(Array.isArray(entries), "Manifest must be an array.");

for (const entry of entries) {
  ensure(typeof entry.id === "string", "Manifest entry missing id.");
  ensure(entry.status === "ready" || entry.status === "planned", `Invalid status for ${entry.id}.`);
  ensure(Array.isArray(entry.languages), `Invalid languages for ${entry.id}.`);
  ensure(typeof entry.docsSlug === "string", `Missing docsSlug for ${entry.id}.`);
  ensure(typeof entry.complexity === "string", `Missing complexity for ${entry.id}.`);
  ensure(typeof entry.pattern === "string", `Missing pattern for ${entry.id}.`);
}

writeFile(
  path.join(root, "cli", "src", "utils", "blueprints.ts"),
  generateCliBlueprints(entries),
);

const readmePath = path.join(root, "README.md");
const readmeContent = fs.readFileSync(readmePath, "utf8");
const newReadme = replaceReadmeBlueprintSection(readmeContent, generateReadmeSection(entries));
writeFile(readmePath, newReadme);

writeFile(
  path.join(root, "website", "docs", "blueprints", "index.md"),
  generateWebsiteBlueprintIndex(entries),
);

writeFile(
  path.join(root, "website", "sidebars.ts"),
  generateSidebars(entries),
);

console.log("Synced CLI/docs/sidebar from blueprints/manifest.json");
