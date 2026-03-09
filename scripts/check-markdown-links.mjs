#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const markdownFiles = [];
const manifestPath = path.join(root, "blueprints", "manifest.json");
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : [];
const plannedBlueprintIds = new Set(
  manifest.filter((m) => m.status === "planned").map((m) => m.id),
);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.name === ".git" ||
      entry.name === "node_modules" ||
      entry.name === ".venv"
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      markdownFiles.push(full);
    }
  }
}

function isExternal(target) {
  return (
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.startsWith("mailto:") ||
    target.startsWith("tel:")
  );
}

function normalizeTarget(target) {
  const noAnchor = target.split("#")[0];
  const noQuery = noAnchor.split("?")[0];
  return noQuery.trim();
}

function isPlannedBlueprintLink(filePath, target) {
  const resolved = path.resolve(path.dirname(filePath), target);
  const rel = path.relative(root, resolved).replaceAll("\\", "/");
  const match = rel.match(/^blueprints\/(\d{2}-[a-z0-9-]+)(\/|$)/);
  if (!match) return false;
  return plannedBlueprintIds.has(match[1]);
}

walk(root);

const errors = [];
const linkPattern = /\[[^\]]*]\(([^)]+)\)/g;

for (const filePath of markdownFiles) {
  const content = fs.readFileSync(filePath, "utf8");
  const relFile = path.relative(root, filePath);
  for (const match of content.matchAll(linkPattern)) {
    const rawTarget = match[1];
    const target = normalizeTarget(rawTarget);
    if (!target) continue;
    if (isExternal(target)) continue;
    if (target.startsWith("#")) continue;
    // Route links are checked by site build; this checker focuses on local file links.
    if (target.startsWith("/")) continue;
    if (isPlannedBlueprintLink(filePath, target)) continue;

    const resolved = path.resolve(path.dirname(filePath), target);
    const existsAsFile = fs.existsSync(resolved) && fs.statSync(resolved).isFile();
    const existsAsDir = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory();
    const existsAsMd = fs.existsSync(`${resolved}.md`) && fs.statSync(`${resolved}.md`).isFile();
    const existsAsReadme = fs.existsSync(path.join(resolved, "README.md"));

    if (!existsAsFile && !existsAsDir && !existsAsMd && !existsAsReadme) {
      errors.push(`${relFile}: broken local link -> ${rawTarget}`);
    }
  }
}

if (errors.length > 0) {
  for (const err of errors) {
    console.error(`markdown-links: ${err}`);
  }
  process.exit(1);
}

console.log("markdown-links: OK");
