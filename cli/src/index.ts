#!/usr/bin/env node
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Command } from 'commander';
import { initCommand } from './commands/init.js';

// Resolve package.json relative to this file so we can pull the version at
// runtime without hardcoding it.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Walk up from dist/ to find package.json
const pkg = require(path.resolve(__dirname, '..', 'package.json')) as {
  name: string;
  version: string;
  description: string;
};

const program = new Command();

program
  .name('agent-blueprints')
  .version(pkg.version, '-v, --version', 'Print the current version')
  .description(pkg.description);

program
  .command('init')
  .description('Initialize a new agent blueprint project')
  .option(
    '--blueprint <name>',
    'Blueprint id or numeric prefix to scaffold (e.g. "01" or "01-react-agent")',
  )
  .option(
    '--language <python|typescript|both>',
    'Language implementation to copy',
  )
  .option(
    '--dir <directory>',
    'Target directory for the scaffolded project',
  )
  .action(async (options: { blueprint?: string; language?: string; dir?: string }) => {
    await initCommand(options);
  });

// Default to showing help when no sub-command is provided
program.addHelpText(
  'after',
  `
Examples:
  $ npx agent-blueprints@latest init
  $ npx agent-blueprints@latest init --blueprint 01-react-agent --language typescript
  $ npx agent-blueprints@latest init --blueprint 07 --language python --dir ./my-rag-bot
`,
);

program.parse(process.argv);
