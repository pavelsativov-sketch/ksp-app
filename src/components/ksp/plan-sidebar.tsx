"use client";

import { useState } from "react";
import { Check, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import { fill } from "@/lib/i18n/dictionaries";

export interface SidebarSection {
  id: string;
  label: string;
  completed: boolean;
  active: boolean;
}

interface PlanSidebarProps {
  sections: SidebarSection[];
  onSectionClick: (sectionId: string) => void;
  progress: { percent: number; done: number; total: number };
}

export function PlanSidebar({ sections, onSectionClick, progress }: PlanSidebarProps) {
  const { t } = useUiLocale();
  const sb = t.planEditor.sidebar;
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <nav className="space-y-1" aria-label={sb.navAria}>
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={() => {
            onSectionClick(section.id);
            setMobileOpen(false);
          }}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
            section.active
              ? "bg-primary-soft font-medium text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
              section.completed
                ? "border-primary bg-primary text-white"
                : section.active
                  ? "border-primary text-primary"
                  : "border-border-strong text-muted-foreground"
            )}
          >
            {section.completed ? <Check className="size-3" /> : null}
          </span>
          <span className="truncate">{section.label}</span>
        </button>
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile toggle button */}
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed bottom-20 right-4 z-40 flex size-12 items-center justify-center rounded-full border border-border bg-surface shadow-card md:hidden"
        aria-label={sb.open}
      >
        {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 right-0 z-40 h-full w-64 transform border-l border-border bg-surface p-4 transition-transform duration-300 md:static md:z-auto md:h-auto md:w-56 md:shrink-0 md:transform-none md:rounded-2xl md:border md:p-3",
          mobileOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {sb.sections}
          </span>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="text-muted-foreground md:hidden"
            aria-label={sb.close}
          >
            <X className="size-4" />
          </button>
        </div>
        {sidebarContent}
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{sb.progress}</span>
            <span>{progress.percent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {fill(sb.filled, { done: progress.done, total: progress.total })}
          </p>
        </div>
      </aside>
    </>
  );
}
