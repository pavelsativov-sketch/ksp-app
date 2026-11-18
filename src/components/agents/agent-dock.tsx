"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Maximize2, Minimize2, X, Bot } from "lucide-react";
import { AgentSession, StatusDot, type AgentStatus } from "./agent-session";
import { RuntimeModeBadge } from "./runtime-mode-badge";
import type { AgentRuntimeMode } from "@/lib/agents/runtime-mode";

const KEY = "mekty:agent-task";

export interface ActiveTask {
  id: string;
  title: string;
  prompt?: string;
  startedAt?: number;
}

export interface SharedTaskSummary {
  id: string;
  title?: string;
  prompt?: string;
  status: string;
  result?: string | null;
  error?: string | null;
  createdAt: string;
}

let cache: ActiveTask | null = null;
let cacheRaw: string | null = null;

let lastFetchFn: unknown = null;
let tasksInFlight: Promise<{ tasks?: SharedTaskSummary[] } | null> | null = null;
let tasksCache: { data: { tasks?: SharedTaskSummary[] }; at: number } | null = null;
const verifiedTaskIds = new Set<string>();

function resetIfFetchChanged() {
  if (typeof fetch !== "undefined" && lastFetchFn !== fetch) {
    lastFetchFn = fetch;
    tasksInFlight = null;
    tasksCache = null;
    verifiedTaskIds.clear();
  }
}

export function invalidateSharedTasksCache(): void {
  tasksInFlight = null;
  tasksCache = null;
}

/**
 * Дедуплицированный запрос списка задач: параллельные вызовы из нескольких
 * компонентов делят один HTTP-запрос и короткий кэш, не перегружая БД.
 */
export async function fetchTasksShared(maxAgeMs = 1500): Promise<{ tasks?: SharedTaskSummary[] } | null> {
  resetIfFetchChanged();
  if (tasksCache && Date.now() - tasksCache.at < maxAgeMs) {
    return tasksCache.data;
  }
  if (tasksInFlight) return tasksInFlight;

  const pending = fetch("/api/agents/task", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return null;
      const data = (await response.json()) as { tasks?: SharedTaskSummary[] };
      tasksCache = { data, at: Date.now() };
      return data;
    })
    .catch(() => null)
    .finally(() => {
      if (tasksInFlight === pending) tasksInFlight = null;
    });

  tasksInFlight = pending;
  return pending;
}

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
  const task = useSyncExternalStore(subscribe, read, () => serverSnapshot);
  const taskId = task?.id;

  // localStorage принадлежит браузерному профилю, а не аккаунту Mekty. После
  // выхода и входа под другим пользователем там может остаться чужая задача.
  // Сверяем id с серверным списком один раз на taskId (через общий кэш).
  useEffect(() => {
    if (!taskId) return;
    resetIfFetchChanged();
    if (verifiedTaskIds.has(taskId)) return;
    let active = true;

    void fetchTasksShared(1500).then((data) => {
      if (!active || !data) return;
      if (!data.tasks?.some((candidate) => candidate.id === taskId)) {
        verifiedTaskIds.delete(taskId);
        clearActiveAgentTask();
      } else {
        verifiedTaskIds.add(taskId);
      }
    });

    return () => { active = false; };
  }, [taskId]);

  return task;
}

/**
 * Запоминает активную задачу. Полный текст запроса нужен не только радио-
 * дока: в чате он показывается пузырём пользователя, а кнопка «Запустить»
 * в панели ОС может повторить последнюю задачу.
 */
export function setActiveAgentTask(id: string, title: string, prompt?: string): void {
  const entry: ActiveTask = { id, title, prompt, startedAt: Date.now() };
  try {
    const raw = JSON.stringify(entry);
    window.localStorage.setItem(KEY, raw);
    cache = entry;
    cacheRaw = raw;
  } catch { /* приватный режим — док просто не появится */ }
  verifiedTaskIds.add(id);
  invalidateSharedTasksCache();
  window.dispatchEvent(new Event("mekty:agent-task"));
}

export function clearActiveAgentTask(): void {
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
  cache = null;
  cacheRaw = null;
  verifiedTaskIds.clear();
  invalidateSharedTasksCache();
  window.dispatchEvent(new Event("mekty:agent-task"));
}

/**
 * Плавающее окно реальной сессии агента: живёт на любой странице /school,
 * свернуто — маленькое окно справа внизу, разворачивается на весь экран.
 */
export function AgentDock() {
  const task = useActiveAgentTask();
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<AgentStatus>("running");
  const mode: AgentRuntimeMode = "vercel";

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
            ? "fixed inset-4 z-[70] flex flex-col overflow-hidden rounded-2xl border border-border bg-[#151034] shadow-2xl md:inset-x-[8%] md:inset-y-[6%]"
            : "fixed bottom-4 right-4 z-[70] flex h-[320px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-[#151034] shadow-2xl"
        }
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
          <Bot className="size-4 text-emerald-400" />
          <StatusDot status={status} />
          <p className="min-w-0 flex-1 truncate text-xs font-semibold text-white">{task.title}</p>
          <RuntimeModeBadge mode={mode} />
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-white"
            aria-label={expanded ? "Свернуть окно" : "Развернуть окно"}
          >
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => { clearActiveAgentTask(); setExpanded(false); }}
            className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-white"
            aria-label="Закрыть окно"
          >
            <X className="size-4" />
          </button>
        </header>
        <AgentSession taskId={task.id} variant="compact" onStatus={setStatus} />
      </section>
    </>
  );
}
