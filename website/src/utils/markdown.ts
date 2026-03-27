/**
 * Server-side markdown processing for Astro SSG.
 * Mermaid blocks are preserved as <div class="mermaid">…</div>
 * for client-side rendering by mermaid.js.
 */
import { marked } from 'marked';
import { slugify } from './content';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

marked.use({
  renderer: {
    heading({ text, depth }: { text: string; depth: number }) {
      const id = slugify(text);
      return `<h${depth} id="${id}">${text}</h${depth}>\n`;
    },
    code({ text, lang }: { text: string; lang?: string }) {
      if (lang === 'mermaid') {
        return `<div class="mermaid-wrapper"><div class="mermaid">${escapeHtml(text)}</div></div>\n`;
      }
      const langClass = lang ? `language-${lang}` : 'language-text';
      return `<div class="relative group mb-6">
<pre class="bg-surface border border-surface-border rounded-xl p-4 overflow-x-auto text-sm font-mono leading-relaxed">
<code class="${langClass}">${escapeHtml(text)}</code>
</pre>
</div>\n`;
    },
    link({ href, title, text }: { href: string; title?: string | null; text: string }) {
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      if (href && (href.startsWith('http') || href.startsWith('//'))) {
        return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
      // Normalize relative markdown links
      const cleanHref = href ? href.replace(/\.md$/, '/') : '#';
      return `<a href="${cleanHref}"${titleAttr}>${text}</a>`;
    },
    blockquote({ text }: { text: string }) {
      return `<blockquote class="border-l-4 border-accent pl-4 py-1 my-4 bg-accent-light rounded-r-lg">
<p class="text-text-secondary italic mb-0">${text}</p>
</blockquote>\n`;
    },
  },
  gfm: true,
  breaks: false,
});

export function renderMarkdown(markdown: string): string {
  return marked.parse(markdown) as string;
}
