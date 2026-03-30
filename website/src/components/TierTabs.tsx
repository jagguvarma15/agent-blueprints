import { useState, useEffect, useRef } from 'react';

type Tier = 'overview' | 'design' | 'implementation' | 'evolution' | 'observability' | 'cost-latency';

interface Tab {
  id: Tier;
  label: string;
}

interface TierTabsProps {
  tabs: Tab[];
  defaultTier?: Tier;
  /** Raw HTML content for each tier */
  content: Partial<Record<Tier, string>>;
}

export default function TierTabs({ tabs, defaultTier = 'overview', content }: TierTabsProps) {
  const [active, setActive] = useState<Tier>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tier = params.get('tier') as Tier | null;
      if (tier && tabs.find((t) => t.id === tier)) return tier;
    }
    return defaultTier;
  });

  const indicatorRef = useRef<HTMLSpanElement>(null);
  const tabRefs = useRef<Map<Tier, HTMLButtonElement>>(new Map());

  // Animate underline indicator
  useEffect(() => {
    const activeTab = tabRefs.current.get(active);
    const indicator = indicatorRef.current;
    if (!activeTab || !indicator) return;
    indicator.style.left = `${activeTab.offsetLeft}px`;
    indicator.style.width = `${activeTab.offsetWidth}px`;
  }, [active]);

  // Sync URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (active === defaultTier) {
      url.searchParams.delete('tier');
    } else {
      url.searchParams.set('tier', active);
    }
    window.history.replaceState(null, '', url.toString());
  }, [active, defaultTier]);

  // Initialize indicator position on mount
  useEffect(() => {
    const activeTab = tabRefs.current.get(active);
    const indicator = indicatorRef.current;
    if (!activeTab || !indicator) return;
    indicator.style.left = `${activeTab.offsetLeft}px`;
    indicator.style.width = `${activeTab.offsetWidth}px`;
    indicator.style.transition = 'none';
    setTimeout(() => {
      if (indicator) indicator.style.transition = 'left 200ms ease, width 200ms ease';
    }, 50);
  }, []);

  const activeContent = content[active];

  return (
    <div>
      {/* Tab bar */}
      <div className="relative mb-8">
        <div className="flex gap-0 border-b border-surface-border" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
              }}
              role="tab"
              aria-selected={active === tab.id}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => setActive(tab.id)}
              className={`px-4 py-3 text-sm font-medium transition-colors relative z-10 ${
                active === tab.id
                  ? 'text-accent'
                  : 'text-text-secondary hover:text-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* Animated underline */}
        <span
          ref={indicatorRef}
          className="absolute bottom-0 h-0.5 bg-accent rounded-full pointer-events-none"
          style={{ left: 0, width: 0 }}
          aria-hidden="true"
        />
      </div>

      {/* Tab panels */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={active !== tab.id}
        >
          {active === tab.id && (
            activeContent ? (
              <div
                className="prose-content"
                dangerouslySetInnerHTML={{ __html: activeContent }}
              />
            ) : (
              <div className="py-16 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-surface rounded-xl mb-4">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <p className="text-text-secondary text-sm">This section is coming soon.</p>
              </div>
            )
          )}
        </div>
      ))}
    </div>
  );
}
