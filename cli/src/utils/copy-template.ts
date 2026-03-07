import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type Language = 'python' | 'typescript' | 'both';

export interface CopyResult {
  copiedFiles: string[];
  envCreated: boolean;
}

/**
 * Resolve the root of the agent-blueprints monorepo relative to this CLI
 * package.  The compiled output lives at:
 *   cli/dist/utils/copy-template.js
 * so we climb two levels (dist/utils -> dist -> cli) then one more to reach
 * the monorepo root where each numbered blueprint directory lives.
 */
function monorepoRoot(): string {
  // __dirname = <repo>/cli/dist/utils  (at runtime after tsc build)
  return path.resolve(__dirname, '..', '..', '..');
}

/**
 * Return the subdirectory name inside a blueprint folder for the requested
 * language.  Returns undefined when we want to copy the whole blueprint dir.
 */
function languageSubdir(language: Language): string[] {
  switch (language) {
    case 'python':
      return ['python'];
    case 'typescript':
      return ['typescript'];
    case 'both':
      return ['python', 'typescript'];
  }
}

/**
 * Collect a flat list of relative file paths inside a directory tree.
 */
async function listFiles(dir: string, base = dir): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFiles(full, base)));
    } else {
      results.push(path.relative(base, full));
    }
  }

  return results;
}

/**
 * Copy template files for the given blueprint and language into targetDir.
 *
 * @param blueprintId  e.g. '01-react-agent'
 * @param language     'python' | 'typescript' | 'both'
 * @param targetDir    Absolute or relative path to the output directory
 * @returns            Metadata about what was copied
 */
export async function copyTemplate(
  blueprintId: string,
  language: Language,
  targetDir: string,
): Promise<CopyResult> {
  const root = monorepoRoot();
  const blueprintSrc = path.join(root, blueprintId);
  const dest = path.resolve(targetDir);

  // Ensure destination exists
  await fs.ensureDir(dest);

  const copiedFiles: string[] = [];
  const subdirs = languageSubdir(language);

  for (const subdir of subdirs) {
    const srcSubdir = path.join(blueprintSrc, subdir);
    const destSubdir = language === 'both' ? path.join(dest, subdir) : dest;

    if (await fs.pathExists(srcSubdir)) {
      await fs.copy(srcSubdir, destSubdir, { overwrite: false, errorOnExist: false });
      const files = await listFiles(srcSubdir);
      copiedFiles.push(...files.map((f) => path.join(subdir, f)));
    } else {
      // Fallback: copy everything from the blueprint root if language-specific
      // subdirectory does not exist yet
      await fs.copy(blueprintSrc, destSubdir, {
        overwrite: false,
        errorOnExist: false,
        filter: (src) => {
          const rel = path.relative(blueprintSrc, src);
          // Skip the other language directory when copying 'both'
          return true; // copy everything if subdir not found
        },
      });
      const files = await listFiles(blueprintSrc);
      copiedFiles.push(...files);
      break; // only copy once in fallback mode
    }
  }

  // Create .env from .env.example if present and .env doesn't already exist
  let envCreated = false;
  const envExamplePath = path.join(dest, '.env.example');
  const envPath = path.join(dest, '.env');

  if ((await fs.pathExists(envExamplePath)) && !(await fs.pathExists(envPath))) {
    await fs.copy(envExamplePath, envPath);
    envCreated = true;
  }

  return { copiedFiles, envCreated };
}
