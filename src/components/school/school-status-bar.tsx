"use client";

import { useActiveTaskStatus } from "@/components/agents/use-task-status";

const LABELS: Record<string, string> = {
  running: "Работает",
  completed: "Завершено",
  failed: "Ошибка",
  stopped: "Остановлено",
  idle: "Ожидание",
};

/**
 * Статус-бар приложения во всю ширину (как в референсе): слева — реальная
 * спецификация окружения, справа — состояние активной задачи агента и её
 * время работы в формате чч:мм:сс.
 */
export function SchoolStatusBar({ sysInfo }: { sysInfo: string }) {
  const { status, elapsed } = useActiveTaskStatus();
  const dotClass =
    status === "running"
      ? "bg-emerald-400 animate-pulse"
      : status === "completed"
        ? "bg-emerald-400"
        : status === "failed"
          ? "bg-red-400"
          : status === "stopped"
            ? "bg-amber-400"
            : "bg-slate-600";

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-white/10 bg-[#0b0d13] px-3 font-mono text-[11px] text-slate-400">
      <span className="truncate" title={sysInfo}>{sysInfo}</span>
      <span className="ml-auto inline-flex shrink-0 items-center gap-1.5" aria-live="polite">
        <span className={`inline-block size-1.5 rounded-full ${dotClass}`} aria-hidden />
        {LABELS[status]}
        {status === "running" && elapsed && <span className="text-slate-300">{elapsed}</span>}
      </span>
    </footer>
  );
}
