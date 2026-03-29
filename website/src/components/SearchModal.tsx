import { useState, useEffect, useRef, useCallback } from 'react';

interface PagefindResult {
  id: string;
  score: number;
  data: () => Promise<PagefindResultData>;
}

interface PagefindResultData {
  url: string;
  title: string;
  excerpt: string;
  meta: { title?: string };
}

interface Pagefind {
  search: (query: string) => Promise<{ results: PagefindResult[] }>;
  init?: () => Promise<void>;
  destroy?: () => Promise<void>;
}

declare global {
  interface Window {
    _pagefind?: Pagefind;
  }
}

interface SearchModalProps {
  base: string;
}

export default function SearchModal({ base }: SearchModalProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PagefindResultData[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pagefindRef = useRef<Pagefind | null>(null);

  // Load Pagefind JS bundle on first open
  const loadPagefind = useCallback(async () => {
    if (pagefindRef.current || unavailable) return;
    try {
      // Pagefind generates this file at build time via `pagefind --site dist`
      const pf = await import(/* @vite-ignore */ `${base}/pagefind/pagefind.js`) as Pagefind;
      if (pf.init) await pf.init();
      pagefindRef.current = pf;
      window._pagefind = pf;
    } catch {
      setUnavailable(true);
    }
  }, [base, unavailable]);

  // Keyboard shortcut: Cmd/Ctrl+K to open, Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Focus input when modal opens; load Pagefind
  useEffect(() => {
    if (!open) return;
    loadPagefind();
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, loadPagefind]);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || !pagefindRef.current) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { results: raw } = await pagefindRef.current!.search(query);
        const top = await Promise.all(raw.slice(0, 8).map((r) => r.data()));
        setResults(top);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const close = () => {
    setOpen(false);
    setQuery('');
    setResults([]);
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4"
      style={{ background: 'rgba(0,0,0,0.35)' }}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="w-full max-w-2xl bg-bg rounded-2xl shadow-2xl border border-surface-border overflow-hidden">

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border">
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="#9CA3AF" strokeWidth="2" className="flex-shrink-0"
          >
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search patterns, concepts, code..."
            className="flex-1 text-sm text-text placeholder-text-tertiary bg-transparent outline-none font-body"
            aria-label="Search documentation"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-text-tertiary hover:text-text transition-colors flex-shrink-0"
              aria-label="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
          <kbd className="hidden sm:flex items-center text-2xs text-text-tertiary bg-surface border border-surface-border rounded px-1.5 py-0.5 font-mono flex-shrink-0">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">

          {unavailable && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-text-secondary">
                Search index not available.
              </p>
              <p className="text-xs text-text-tertiary mt-1 font-mono">
                Run <code className="bg-surface px-1 rounded">npm run build</code> to generate the search index.
              </p>
            </div>
          )}

          {!unavailable && !query && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-text-tertiary">Type to search all patterns, foundations, and guides.</p>
            </div>
          )}

          {!unavailable && query && loading && (
            <div className="px-4 py-6 text-center">
              <div className="inline-flex items-center gap-2 text-sm text-text-tertiary">
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56"/>
                </svg>
                Searching...
              </div>
            </div>
          )}

          {!unavailable && query && !loading && results.length === 0 && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-text-secondary">No results for <strong>"{query}"</strong></p>
              <p className="text-xs text-text-tertiary mt-1">Try a different search term.</p>
            </div>
          )}

          {!unavailable && results.length > 0 && (
            <ul>
              {results.map((result, i) => (
                <li key={i} className="border-b border-surface-border last:border-0">
                  <a
                    href={result.url}
                    onClick={close}
                    className="block px-4 py-3 hover:bg-bg-alt transition-colors"
                  >
                    <p className="text-sm font-medium text-text mb-0.5 font-display tracking-display">
                      {result.meta?.title || result.title || 'Untitled'}
                    </p>
                    {result.excerpt && (
                      <p
                        className="text-xs text-text-secondary leading-relaxed line-clamp-2"
                        dangerouslySetInnerHTML={{ __html: result.excerpt }}
                      />
                    )}
                    <p className="text-2xs text-text-tertiary font-mono mt-1 truncate">
                      {result.url}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2.5 border-t border-surface-border flex items-center justify-between bg-bg-alt">
          <span className="text-2xs text-text-tertiary font-mono">
            {results.length > 0 ? `${results.length} result${results.length > 1 ? 's' : ''}` : 'Powered by Pagefind'}
          </span>
          <div className="flex items-center gap-3 text-2xs text-text-tertiary font-mono">
            <span>Enter to navigate</span>
            <span>Esc to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
