import type { APIRoute } from 'astro';
import { readMarkdown } from '../utils/content';

const SITE = 'https://jagguvarma15.github.io/agent-blueprints';
const TITLE = 'Agent Blueprints — Changelog';
const DESCRIPTION = 'Release notes for agent-blueprints: cognitive patterns and design guidance for LLM workflow and agent systems.';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Parse the changelog markdown into RSS items.
 * Each `## [version] - YYYY-MM-DD` heading becomes one item.
 * The unreleased section is skipped — it's not a release.
 */
function parseChangelog(md: string): Array<{ title: string; pubDate: Date; body: string }> {
  const items: Array<{ title: string; pubDate: Date; body: string }> = [];
  const lines = md.split('\n');
  let current: { title: string; pubDate: Date | null; body: string[] } | null = null;

  const flush = () => {
    if (current && current.pubDate) {
      items.push({
        title: current.title,
        pubDate: current.pubDate,
        body: current.body.join('\n').trim(),
      });
    }
  };

  for (const line of lines) {
    const match = line.match(/^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}(?:-\d{2})?))?/);
    if (match) {
      flush();
      const version = match[1];
      const dateStr = match[2];
      // Skip Unreleased and approximate-date sections.
      if (version.toLowerCase() === 'unreleased' || !dateStr || dateStr.length < 10) {
        current = null;
        continue;
      }
      current = {
        title: `Release ${version}`,
        pubDate: new Date(dateStr),
        body: [],
      };
    } else if (current) {
      current.body.push(line);
    }
  }
  flush();
  return items;
}

export const GET: APIRoute = () => {
  const md = readMarkdown('meta/changelog.md');
  if (!md) {
    return new Response('Changelog not found', { status: 404 });
  }
  const items = parseChangelog(md);
  const lastBuildDate = items[0]?.pubDate ?? new Date();

  const itemsXml = items
    .map(
      (it) => `    <item>
      <title>${escapeXml(it.title)}</title>
      <link>${SITE}/changelog/</link>
      <guid isPermaLink="false">${SITE}/changelog/#${escapeXml(it.title.replace(/\s+/g, '-').toLowerCase())}</guid>
      <pubDate>${it.pubDate.toUTCString()}</pubDate>
      <description>${escapeXml(it.body)}</description>
    </item>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(TITLE)}</title>
    <link>${SITE}/changelog/</link>
    <description>${escapeXml(DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate.toUTCString()}</lastBuildDate>
    <atom:link href="${SITE}/changelog.xml" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};
