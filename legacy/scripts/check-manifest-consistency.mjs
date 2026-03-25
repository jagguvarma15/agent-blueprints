#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "blueprints", "manifest.json");
const blueprintsDir = path.join(root, "blueprints");

function fail(message) {
  console.error(`manifest-consistency: ${message}`);
  process.exitCode = 1;
}

function isBlueprintDirName(name) {
  return /^\d{2}-[a-z0-9-]+$/.test(name);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const manifestIds = new Set(manifest.map((b) => b.id));

// Check: every ready blueprint exists on disk with declared language folders.
for (const entry of manifest) {
  const blueprintPath = path.join(blueprintsDir, entry.id);
  if (entry.status === "ready") {
    if (!fs.existsSync(blueprintPath) || !fs.statSync(blueprintPath).isDirectory()) {
      fail(`ready blueprint missing directory: blueprints/${entry.id}`);
      continue;
    }
    for (const lang of entry.languages) {
      const langPath = path.join(blueprintPath, lang);
      if (!fs.existsSync(langPath) || !fs.statSync(langPath).isDirectory()) {
        fail(`ready blueprint missing language directory: blueprints/${entry.id}/${lang}`);
      }
    }
  }
}

// Check: every blueprint directory is declared in manifest.
const dirsOnDisk = fs
  .readdirSync(blueprintsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && isBlueprintDirName(d.name))
  .map((d) => d.name);

for (const dir of dirsOnDisk) {
  if (!manifestIds.has(dir)) {
    fail(`filesystem blueprint not declared in manifest: blueprints/${dir}`);
  }
}

if (!process.exitCode) {
  console.log("manifest-consistency: OK");
}

