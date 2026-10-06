"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContextualHelpProps {
  /** The help text to display in the tooltip */
  text: string;
  /** Accessible label for the help button */
  label?: string;
}

/**
 * Contextual help tooltip — small "?" icon next to form labels.
 * Shows a helpful tooltip on hover/click. Non-blocking, dismissible.
 */
export function ContextualHelp({ text, label = "Подсказка" }: ContextualHelpProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!visible) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setVisible(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [visible]);

  // Close on Escape
  useEffect(() => {
    if (!visible) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setVisible(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [visible]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        aria-label={label}
        aria-expanded={visible}
        className={cn(
          "inline-flex size-4 items-center justify-center rounded-full transition-colors",
          "text-muted-foreground hover:bg-primary-soft hover:text-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
      >
        <HelpCircle className="size-4" />
      </button>

      {visible && (
        <div
          role="tooltip"
          className={cn(
            "absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2",
            "rounded-xl border border-border bg-surface p-3 shadow-card",
            "animate-in fade-in-0 zoom-in-95 duration-150",
            "text-xs leading-relaxed text-foreground",
          )}
        >
          {text}
          {/* Arrow */}
          <div className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-1/2">
            <div className="size-2 rotate-45 border-b border-r border-border bg-surface" />
          </div>
        </div>
      )}
    </div>
  );
}
