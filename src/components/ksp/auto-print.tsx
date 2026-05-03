"use client";

import { useEffect } from "react";

/**
 * Auto-triggers the browser print dialog after every <img> on the page has
 * finished decoding. Used by the `/plans/[id]/print` route so users can
 * "Save as PDF" with one click without the print preview missing pictures.
 *
 * Falls back to a 1500ms timer if `img.decode()` is unavailable or rejects.
 */
export function AutoPrint() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let fallback: number | null = null;

    function fire() {
      if (cancelled) return;
      try {
        window.print();
      } catch {
        // user can still trigger via Ctrl+P
      }
    }

    async function waitForImagesThenPrint() {
      const imgs = Array.from(document.images);
      if (imgs.length === 0) {
        fire();
        return;
      }
      try {
        await Promise.all(
          imgs.map((img) =>
            img.complete && img.naturalWidth > 0
              ? Promise.resolve()
              : img.decode().catch(() => undefined),
          ),
        );
      } catch {
        // best-effort; ignore decode failures and proceed
      }
      // Give the browser one paint frame to settle layout after images.
      window.requestAnimationFrame(() => {
        window.setTimeout(fire, 60);
      });
    }

    // Hard fallback in case decode() never settles (broken URLs, CORS).
    fallback = window.setTimeout(fire, 1500);
    void waitForImagesThenPrint();

    return () => {
      cancelled = true;
      if (fallback !== null) window.clearTimeout(fallback);
    };
  }, []);
  return null;
}
