import { useState, useEffect } from 'react';

interface Heading {
  level: 2 | 3;
  text: string;
  id: string;
}

interface TableOfContentsProps {
  /** Single-tier pages (e.g. foundations): pass headings directly */
  headings?: Heading[];
  /** Multi-tier pages: pass all tier headings keyed by tier id */
  allHeadings?: Partial<Record<string, Heading[]>>;
  defaultTier?: string;
}

export default function TableOfContents({ headings, allHeadings, defaultTier = 'overview' }: TableOfContentsProps) {
  const [activeTier, setActiveTier] = useState<string>(() => {
    if (allHeadings && typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('tier') ?? defaultTier;
    }
    return defaultTier;
  });
  const [activeId, setActiveId] = useState<string>('');

  const activeHeadings = allHeadings
    ? (allHeadings[activeTier] ?? allHeadings[defaultTier] ?? [])
    : (headings ?? []);

  // Listen for tab switches from TierTabs
  useEffect(() => {
    if (!allHeadings) return;
    const handler = (e: Event) => {
      setActiveTier((e as CustomEvent<{ tier: string }>).detail.tier);
      setActiveId('');
    };
    window.addEventListener('tier-change', handler);
    return () => window.removeEventListener('tier-change', handler);
  }, [allHeadings]);

  useEffect(() => {
    if (activeHeadings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );

    activeHeadings.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [activeHeadings]);

  if (activeHeadings.length === 0) return null;

  return (
    <nav aria-label="Table of contents" className="sticky top-14 py-8 max-h-[calc(100vh-3.5rem)] overflow-y-auto">
      <p className="text-2xs font-semibold font-mono uppercase tracking-widest text-text-tertiary mb-3 px-2">
        On this page
      </p>
      <ul className="space-y-0.5">
        {activeHeadings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={`block text-xs py-1 transition-colors rounded ${
                h.level === 3 ? 'pl-5 pr-2' : 'px-2'
              } ${
                activeId === h.id
                  ? 'text-accent font-medium'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
