#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-blueprints-smoke-"));
const outDir = path.join(tmpDir, "react-python");

const cmd = process.execPath;
const cliEntry = path.join(root, "cli", "dist", "index.js");
const args = [
  cliEntry,
  "init",
  "--blueprint",
  "01-react-agent",
  "--language",
  "python",
  "--dir",
  outDir,
];

const result = spawnSync(cmd, args, {
  cwd: root,
  env: {
    ...process.env,
    ANTHROPIC_API_KEY: "sk-ant-smoke-test-key",
  },
  input: "\n",
  encoding: "utf8",
});

if (result.status !== 0) {
  console.error("cli-smoke: CLI init failed");
  if (result.stdout) console.error(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exit(1);
}

const requiredFiles = [
  path.join(outDir, "pyproject.toml"),
  path.join(outDir, "src", "main.py"),
  path.join(outDir, ".env"),
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`cli-smoke: missing expected scaffold file: ${file}`);
    process.exit(1);
  }
}

const envContent = fs.readFileSync(path.join(outDir, ".env"), "utf8");
const keyLine = envContent
  .split(/\r?\n/)
  .find((line) => line.startsWith("ANTHROPIC_API_KEY="));
if (!keyLine || keyLine.trim() === "ANTHROPIC_API_KEY=") {
  console.error("cli-smoke: .env does not contain a non-empty ANTHROPIC_API_KEY");
  process.exit(1);
}

console.log("cli-smoke: OK");
