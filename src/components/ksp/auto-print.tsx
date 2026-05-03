"use client";

import { useEffect } from "react";

/**
 * Auto-triggers the browser print dialog after first paint. Used by the
 * `/plans/[id]/print` route so users can "Save as PDF" with one click.
 */
export function AutoPrint() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Defer until images are likely loaded so the print preview includes them.
    const id = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        // ignore — user can still trigger via Ctrl+P
      }
    }, 600);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
