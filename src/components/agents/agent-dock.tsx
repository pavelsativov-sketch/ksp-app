"use client";

import { useState, useSyncExternalStore } from "react";
import { Maximize2, Minimize2, X, Bot } from "lucide-react";
import { AgentSession, StatusDot } from "./agent-session";

const KEY = "mekty:agent-task";

interface ActiveTask { id: string; title: string; prompt?: string }

let cache: ActiveTask | null = null;
let cacheRaw: string | null = null;

function read(): ActiveTask | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === cacheRaw) return cache;
    cacheRaw = raw;
    cache = raw ? (JSON.parse(raw) as ActiveTask) : null;
    return cache;
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("mekty:agent-task", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("mekty:agent-task", cb);
  };
}

const serverSnapshot = null;

/** Активная задача агента (общая для всех страниц через localStorage). */
export function useActiveAgentTask(): ActiveTask | null {
  return useSyncExternalStore(subscribe, read, () => serverSnapshot);
}

/**
 * Запоминает активную задачу. Полный текст запроса нужен не только радио-
 * дока: в чате он показывается пузырём пользователя, а кнопка «Запустить»
 * в панели ОС может повторить последнюю задачу.
 */
export function setActiveAgentTask(id: string, title: string, prompt?: string): void {
  try {
    const raw = JSON.stringify({ id, title, prompt });
    window.localStorage.setItem(KEY, raw);
    cache = JSON.parse(raw) as ActiveTask;
    cacheRaw = raw;
  } catch { /* приватный режим — док просто не появится */ }
  window.dispatchEvent(new Event("mekty:agent-task"));
}

export function clearActiveAgentTask(): void {
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
  cache = null; cacheRaw = null;
  window.dispatchEvent(new Event("mekty:agent-task"));
}

/**
 * Плавающее окно реальной сессии агента: живёт на любой странице /school,
 * свернуто — маленькое окно справа внизу, разворачивается на весь экран.
 */
export function AgentDock() {
  const task = useActiveAgentTask();
  const [expanded, setExpanded] = useState(false);

  // useSyncExternalStore гидрационно-безопасен: на сервере и при первом
  // клиентском рендере task === null, окно появляется сразу после гидрации.
  if (!task) return null;

  return (
    <>
      {expanded && (
        <div className="fixed inset-0 z-[60] bg-black/60" onClick={() => setExpanded(false)} aria-hidden />
      )}
      <section
        aria-label="Рабочая область агента"
        className={
          expanded
            ? "fixed inset-4 z-[70] flex flex-col overflow-hidden rounded-2xl border border-border bg-[#0d1117] shadow-2xl md:inset-x-[8%] md:inset-y-[6%]"
            : "fixed bottom-4 right-4 z-[70] flex h-[320px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-[#0d1117] shadow-2xl"
        }
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
          <Bot className="size-4 text-emerald-400" />
          <StatusDot status="running" />
          <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-200">{task.title}</p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            aria-label={expanded ? "Свернуть окно" : "Развернуть окно"}
          >
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => { clearActiveAgentTask(); setExpanded(false); }}
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            aria-label="Закрыть окно"
          >
            <X className="size-4" />
          </button>
        </header>
        <AgentSession taskId={task.id} />
      </section>
    </>
  );
}
