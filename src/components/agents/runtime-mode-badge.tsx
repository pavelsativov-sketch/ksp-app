"use client";

import type { AgentRuntimeMode } from "@/lib/agents/runtime-mode";

/** Рабочая область всегда в облаке: плашка напоминает, что команды не касаются компьютера пользователя. */
export function RuntimeModeBadge({ mode }: { mode: AgentRuntimeMode }) {
  void mode;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full bg-violet-400/15 px-2 py-0.5 text-[10px] font-semibold text-violet-200"
      aria-label="Режим: облако Vercel"
    >
      Режим: облако Vercel
    </span>
  );
}
