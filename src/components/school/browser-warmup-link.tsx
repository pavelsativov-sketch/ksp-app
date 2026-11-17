"use client";

import { useCallback, useRef, type ReactNode } from "react";
import Link from "next/link";

interface BrowserWarmupLinkProps {
  href: string;
  className?: string;
  children: ReactNode;
}

/**
 * Starts the personal browser only after the teacher signals intent to open an
 * external service. Hover/focus usually gives the sandbox a useful head start
 * without provisioning a browser for everyone merely visiting the connectors
 * page.
 */
export function BrowserWarmupLink({ href, className, children }: BrowserWarmupLinkProps) {
  const started = useRef(false);
  const warm = useCallback(() => {
    if (started.current) return;
    started.current = true;
    void fetch("/api/health/browser-keepalive", { cache: "no-store" }).catch(() => {
      // BrowserApp displays the actionable error if the environment is unavailable.
    });
  }, []);

  return (
    <Link
      href={href}
      className={className}
      onPointerEnter={warm}
      onPointerDown={warm}
      onFocus={warm}
      onTouchStart={warm}
    >
      {children}
    </Link>
  );
}
