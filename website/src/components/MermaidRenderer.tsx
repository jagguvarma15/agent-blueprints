import { useEffect, useRef, useState } from 'react';

interface MermaidRendererProps {
  code: string;
  className?: string;
}

let mermaidLoaded = false;

export default function MermaidRenderer({ code, className = '' }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;

        if (!mermaidLoaded) {
          mermaid.initialize({
            startOnLoad: false,
            theme: 'base',
            themeVariables: {
              primaryColor: '#F5F5F4',
              primaryTextColor: '#1A1A1A',
              primaryBorderColor: '#E7E5E4',
              lineColor: '#9CA3AF',
              fontFamily: 'IBM Plex Sans, system-ui, sans-serif',
              fontSize: '13px',
            },
            flowchart: { curve: 'basis', padding: 20 },
          });
          mermaidLoaded = true;
        }

        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, code.trim());

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setRendered(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 font-mono ${className}`}>
        <strong>Diagram error:</strong> {error}
      </div>
    );
  }

  return (
    <div className={`mermaid-wrapper ${className}`}>
      <div
        ref={containerRef}
        className="flex justify-center [&>svg]:max-w-full"
      >
        {/* Loading skeleton */}
        {!rendered && (
          <div className="flex items-center gap-2 text-text-tertiary text-sm py-8">
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            Rendering diagram…
          </div>
        )}
      </div>
    </div>
  );
}
