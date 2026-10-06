'use client';
import React, { useRef } from 'react';

export function IframeApp({ url }: { url: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleLoad = () => {
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
    } catch (e) {
      // Cross-origin or other error, ignore
    }
  };

  return (
    <iframe 
      ref={iframeRef}
      src={url} 
      onLoad={handleLoad}
      className="w-full h-full border-none bg-white"
      title="Mektep OS Frame"
    />
  );
}