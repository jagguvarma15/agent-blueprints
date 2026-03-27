import { readFileSync, existsSync } from 'fs';
import path from 'path';

/** Absolute path to the repo root (agent-blueprints/) */
export const REPO_ROOT = (() => {
  const cwd = process.cwd();
  // When running from website/ directory
  if (cwd.endsWith('website')) return path.resolve(cwd, '..');
  // When running from repo root
  if (existsSync(path.join(cwd, 'website'))) return cwd;
  return path.resolve(cwd, '..');
})();

/**
 * Read a markdown file relative to the repo root.
 * Returns null if the file doesn't exist.
 */
export function readMarkdown(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  if (!existsSync(fullPath)) return null;
  try {
    return readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Parse the first heading from a markdown file as the title.
 */
export function extractTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Untitled';
}

/**
 * Extract all headings (h2, h3) from a markdown string for TOC generation.
 */
export interface Heading {
  level: 2 | 3;
  text: string;
  id: string;
}

export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  const lines = markdown.split('\n');
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);
    if (h2) {
      headings.push({ level: 2, text: h2[1].trim(), id: slugify(h2[1]) });
    } else if (h3) {
      headings.push({ level: 3, text: h3[1].trim(), id: slugify(h3[1]) });
    }
  }
  return headings;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Convert markdown to HTML with mermaid block handling.
 * Uses a simple regex-based approach — full marked processing happens client-side for mermaid.
 */
export function preprocessMarkdown(markdown: string): string {
  // Wrap mermaid code blocks so they can be identified
  return markdown.replace(
    /```mermaid\n([\s\S]*?)```/g,
    (_match, code) =>
      `<div class="mermaid-wrapper"><div class="mermaid">${escapeHtml(code.trim())}</div></div>`,
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
