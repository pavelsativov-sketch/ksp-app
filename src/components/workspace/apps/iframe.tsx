'use client';
import React, { useRef, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';

export function IframeApp({ url, title = 'Страница Mekty' }: { url: string; title?: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  const handleLoad = () => {
    setLoaded(true);
    try {
      if (iframeRef.current?.contentDocument) {
        const doc = iframeRef.current.contentDocument;
        // Hide global site header and footer
        const style = doc.createElement('style');
        style.textContent = `
          header, footer, .no-print { display: none !important; }
          main { padding: 0 !important; }
          /* Hide school layout sidebar/topbar if they exist */
          [class*="school-layout_sidebar"], [class*="school-layout_topbar"] { display: none !important; }
          [class*="school-layout_content"] { padding: 1rem !important; }
          /* Adjust layout */
          body { background: transparent !important; }
        `;
        doc.head.appendChild(style);
      }
    } catch {
      // Чужой origin или иная ошибка доступа к документу — стиль не применить,
      // но содержимое iframe при этом работает.
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {!loaded && (
        <p className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 bg-[#1e1e2e] text-sm text-white/50">
          <Loader2 className="size-4 animate-spin" /> Открываю страницу…
        </p>
      )}
      <iframe
        ref={iframeRef}
        src={url}
        onLoad={handleLoad}
        className="h-full w-full flex-1 border-none bg-white"
        title={title}
      />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title="Открыть в новой вкладке"
        aria-label="Открыть в новой вкладке"
        className="absolute bottom-2 right-2 z-20 inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/60 px-2 py-1 text-[11px] text-white/80 backdrop-blur hover:bg-black/80"
      >
        <ExternalLink className="size-3" /> В новой вкладке
      </a>
    </div>
  );
}
