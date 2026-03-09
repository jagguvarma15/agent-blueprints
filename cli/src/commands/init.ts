import {
  intro,
  outro,
  select,
  text,
  password,
  spinner,
  isCancel,
  cancel,
  log,
} from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs-extra';
import path from 'node:path';
import { BLUEPRINTS, findBlueprint, blueprintSlug } from '../utils/blueprints.js';
import { copyTemplate, type Language } from '../utils/copy-template.js';

export interface InitOptions {
  blueprint?: string;
  language?: string;
  dir?: string;
}

/** Gracefully handle cancellation from any clack prompt. */
function assertNotCancelled(value: unknown): asserts value is NonNullable<typeof value> {
  if (isCancel(value)) {
    cancel('Operation cancelled.');
    process.exit(0);
  }
}

/** Map a language label to the internal Language type. */
function parseLanguage(raw: string): Language {
  const lower = raw.toLowerCase();
  if (lower === 'python' || lower === 'typescript' || lower === 'both') {
    return lower as Language;
  }
  return 'both';
}

export async function initCommand(options: InitOptions): Promise<void> {
  intro(pc.bgCyan(pc.black(' Agent Blueprints CLI ')));

  // ── 1. Blueprint selection ──────────────────────────────────────────────
  let selectedBlueprint = options.blueprint
    ? findBlueprint(options.blueprint)
    : undefined;

  if (!selectedBlueprint) {
    if (options.blueprint) {
      log.warn(
        `Blueprint "${options.blueprint}" not found. Please choose from the list below.`,
      );
    }

    const blueprintChoice = await select({
      message: 'Which blueprint would you like to scaffold?',
      options: BLUEPRINTS.filter((b) => b.status === 'ready').map((b) => ({
        value: b.id,
        label: `${pc.bold(b.name)} ${pc.dim(`(${b.complexity} — ${b.pattern})`)}`,
        hint: b.description,
      })),
    });

    assertNotCancelled(blueprintChoice);
    selectedBlueprint = BLUEPRINTS.find((b) => b.id === blueprintChoice)!;
  }

  if (selectedBlueprint.status === 'planned') {
    log.error(
      `Blueprint "${selectedBlueprint.id}" is planned and not scaffoldable yet. ` +
      'Choose one of the ready blueprints: 01-react-agent, 04-multi-agent-supervisor, 07-rag-basic.',
    );
    process.exit(1);
  }

  log.info(
    `Selected: ${pc.bold(selectedBlueprint.name)} — ${selectedBlueprint.description}`,
  );

  // ── 2. Language selection ───────────────────────────────────────────────
  let language: Language;

  if (options.language) {
    language = parseLanguage(options.language);
  } else {
    const languageChoice = await select({
      message: 'Which language implementation would you like?',
      options: [
        {
          value: 'python',
          label: pc.bold('Python'),
          hint: 'Copy the Python implementation only',
        },
        {
          value: 'typescript',
          label: pc.bold('TypeScript'),
          hint: 'Copy the TypeScript implementation only',
        },
        {
          value: 'both',
          label: pc.bold('Both'),
          hint: 'Copy both Python and TypeScript implementations',
        },
      ],
    });

    assertNotCancelled(languageChoice);
    language = languageChoice as Language;
  }

  // ── 3. Target directory ─────────────────────────────────────────────────
  const defaultDir = `./${blueprintSlug(selectedBlueprint)}`;

  let targetDir: string;

  if (options.dir) {
    targetDir = options.dir;
  } else {
    const dirInput = await text({
      message: 'Where should the project be created?',
      placeholder: defaultDir,
      defaultValue: defaultDir,
      validate(value) {
        const dir = value || defaultDir;
        if (dir.trim().length === 0) return 'Directory path cannot be empty.';
        return undefined;
      },
    });

    assertNotCancelled(dirInput);
    targetDir = (dirInput as string) || defaultDir;
  }

  const absoluteTarget = path.resolve(targetDir);

  // ── 4. Copy template files ──────────────────────────────────────────────
  const s = spinner();
  s.start('Scaffolding project files…');

  let copiedFiles: string[] = [];
  let envCreated = false;

  try {
    const result = await copyTemplate(selectedBlueprint.id, language, absoluteTarget);
    copiedFiles = result.copiedFiles;
    envCreated = result.envCreated;
    s.stop(`Copied ${copiedFiles.length} file(s) into ${pc.cyan(absoluteTarget)}`);
  } catch (err) {
    s.stop(pc.red('Failed to copy template files.'));
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // ── 5. ANTHROPIC_API_KEY configuration ──────────────────────────────────
  log.step('Environment configuration');

  const existingKey = process.env['ANTHROPIC_API_KEY'];

  const apiKey = await password({
    message: existingKey
      ? `ANTHROPIC_API_KEY (leave blank to keep existing ${pc.dim('sk-ant-…')})`
      : 'Enter your ANTHROPIC_API_KEY (starts with sk-ant-…)',
    validate(value) {
      if (!value && !existingKey) {
        return 'An API key is required. Get yours at https://console.anthropic.com/';
      }
      if (value && !value.startsWith('sk-ant-')) {
        return 'Anthropic API keys start with "sk-ant-". Please double-check your key.';
      }
      return undefined;
    },
  });

  assertNotCancelled(apiKey);

  const resolvedKey = (apiKey as string).trim() || existingKey || '';

  // Write / update the .env file
  const envPath = path.join(absoluteTarget, '.env');
  let envContent = '';

  if (await fs.pathExists(envPath)) {
    const existing = await fs.readFile(envPath, 'utf8');
    // Replace or append ANTHROPIC_API_KEY
    if (existing.includes('ANTHROPIC_API_KEY')) {
      envContent = existing.replace(
        /^ANTHROPIC_API_KEY=.*$/m,
        `ANTHROPIC_API_KEY=${resolvedKey}`,
      );
    } else {
      envContent = existing.trimEnd() + `\nANTHROPIC_API_KEY=${resolvedKey}\n`;
    }
  } else {
    envContent = `ANTHROPIC_API_KEY=${resolvedKey}\n`;
    envCreated = true;
  }

  await fs.writeFile(envPath, envContent, 'utf8');

  if (envCreated) {
    log.success(`.env file created at ${pc.cyan(envPath)}`);
  } else {
    log.success(`.env file updated at ${pc.cyan(envPath)}`);
  }

  // ── 6. Outro / next steps ───────────────────────────────────────────────
  const relTarget = path.relative(process.cwd(), absoluteTarget) || '.';
  const pythonRunByBlueprint: Record<string, string> = {
    '01-react-agent': 'uv run dev',
    '04-multi-agent-supervisor': 'uv run python src/main.py',
    '07-rag-basic': 'uv run dev',
  };
  const pythonRunCmd = pythonRunByBlueprint[selectedBlueprint.id] ?? 'uv run dev';

  const installCmd = language === 'python'
    ? 'uv sync'
    : language === 'typescript'
      ? 'pnpm install'
      : 'cd python && uv sync && cd ../typescript && pnpm install';

  const runCmd = language === 'python'
    ? pythonRunCmd
    : language === 'typescript'
      ? 'pnpm dev'
      : `cd python && ${pythonRunCmd}   # or: cd typescript && pnpm dev`;

  outro(
    [
      pc.bold(pc.green('Your blueprint is ready!')),
      '',
      pc.bold('Next steps:'),
      `  ${pc.cyan('1.')} cd ${relTarget}`,
      `  ${pc.cyan('2.')} ${installCmd}`,
      `  ${pc.cyan('3.')} ${runCmd}`,
      '',
      `${pc.dim('Docs & examples:')} ${pc.underline('https://github.com/jvarma/agent-blueprints')}`,
    ].join('\n'),
  );
}
