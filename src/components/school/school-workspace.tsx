"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot, ChevronDown, Loader2, Maximize2, Minimize2, Play, Plus, Square, X,
  FolderOpen, Globe, LayoutGrid, ScrollText, TerminalSquare, FileCode, Archive, Undo2,
} from "lucide-react";
import { AgentComposer } from "@/components/agents/agent-composer";
import { setActiveAgentTask, useActiveAgentTask } from "@/components/agents/agent-dock";
import { AgentSession, StatusDot, type AgentStatus } from "@/components/agents/agent-session";
import { CodeEditorApp } from "@/components/workspace/apps/code-editor";
import { PermissionCard } from "@/components/agents/permission-card";
import { useOsShellStore, type OsTab } from "@/lib/store/os-shell";
import { useWorkspaceStore } from "@/lib/store/workspace";
import { WorkspaceSurface } from "@/components/workspace/workspace";
import { BrowserApp } from "@/components/workspace/apps/browser";
import { FileManagerApp } from "@/components/workspace/apps/file-manager";
import { TerminalApp } from "@/components/workspace/apps/terminal";

export type { OsTab };

interface TabDef {
  id: OsTab;
  label: string;
  icon: typeof LayoutGrid;
}

/** Вкладки, которые есть всегда. */
const BASE_TABS: TabDef[] = [
  { id: "os", label: "Рабочий стол", icon: LayoutGrid },
  { id: "browser", label: "Браузер", icon: Globe },
  { id: "files", label: "Файлы", icon: FolderOpen },
  { id: "editor", label: "Редактор", icon: FileCode },
  { id: "terminal", label: "Терминал", icon: TerminalSquare },
];

/** Вкладки, которые добавляются кнопкой «+». */
const EXTRA_TABS: TabDef[] = [{ id: "log", label: "Задача", icon: ScrollText }];

/**
 * Рабочая область как в референсе: слева чат с агентом (пузырь запроса,
 * план-чеклист, прогресс, отмена задачи), справа — рабочий стол с вкладками
 * приложений, режимом ручного управления и отдельными действиями задачи.
 */
export function SchoolWorkspace({ sysInfo = "", initialTab = "os" }: { sysInfo?: string; initialTab?: OsTab }) {
  const router = useRouter();
  const task = useActiveAgentTask();
  const tab = useOsShellStore((s) => s.tab);
  const setTab = useOsShellStore((s) => s.setTab);
  const [extraTabs, setExtraTabs] = useState<OsTab[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileWorkspaceOpen, setMobileWorkspaceOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState<AgentStatus>("completed");
  const [elapsed, setElapsed] = useState<string | null>(null);
  const [control, setControlState] = useState<"user" | "ai">("user");
  const [controlLoaded, setControlLoaded] = useState(false);
  const [editorFile, setEditorFile] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // «В редактор» из файл-менеджера: в двухпанельной раскладке редактор — это
  // вкладка, а не окно, поэтому переключаем вкладку. Реагируем на хранилище
  // рабочей области, а не на событие window: событие слушал только этот
  // компонент, и на полноэкранной странице кнопка «В редактор» не работала.
  useEffect(() => {
    return useWorkspaceStore.subscribe((state, prev) => {
      const now = state.windows.find((w) => w.type === "code-editor")?.file;
      const before = prev.windows.find((w) => w.type === "code-editor")?.file;
      if (now && now !== before) {
        setEditorFile(now);
        setTab("editor");
      }
    });
  }, [setTab]);

  // Владелец управления: опрос + локальное применение кнопок.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const res = await fetch("/api/agents/control", { cache: "no-store" });
        if (res.ok && alive) {
          const data = (await res.json()) as { control?: "user" | "ai" };
          if (data.control) setControlState(data.control);
          setControlLoaded(true);
        }
      } catch { /* некритично */ }
      if (alive) timer = setTimeout(() => void poll(), 15000);
    };
    void poll();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, []);

  const setControl = async (mode: "user" | "ai") => {
    setNotice(null);
    try {
      const response = await fetch("/api/agents/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ control: mode }) });
      if (!response.ok) throw new Error("Не удалось передать управление");
      setControlState(mode);
    } catch { setNotice("Не удалось изменить режим управления. Проверьте соединение."); }
  };

  // Таймер «Работает MM:SS» — от createdAt активной задачи (история задач).
  useEffect(() => {
    if (!task) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/agents/task", { cache: "no-store" });
        if (!res.ok || !alive) return;
        const data = (await res.json()) as { tasks?: { id: string; createdAt: string }[] };
        const found = data.tasks?.find((t) => t.id === task.id);
        if (!alive || !found) return;
        const started = new Date(found.createdAt).getTime();
        const fmt = (ms: number) => {
          const s = Math.max(0, Math.floor(ms / 1000));
          return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
        };
        setElapsed(fmt(Date.now() - started));
        const iv = setInterval(() => {
          if (!alive) { clearInterval(iv); return; }
          setElapsed(fmt(Date.now() - started));
        }, 1000);
      } catch { /* таймер некритичен */ }
    })();
    return () => { alive = false; };
  }, [task]);

  // Deep-link `?os=files` из серверной страницы переключает вкладку один раз
  // при открытии и не спорит с выбором пользователя.
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab, setTab]);

  const visibleTabs = [
    ...BASE_TABS,
    ...EXTRA_TABS.filter((t) => extraTabs.includes(t.id)),
  ];

  async function stopTask() {
    if (!task || stopping) return;
    setStopping(true);
    try { await fetch(`/api/agents/task/${task.id}/stop`, { method: "POST" }); } catch { /* статус придёт по SSE */ }
    setStopping(false);
  }

  /** Повтор последней задачи: та же формулировка, новая сессия агента. */
  async function startLast() {
    const prompt = task?.prompt;
    if (!prompt || starting || status === "running" || status === "connecting") return;
    setStarting(true);
    try {
      const res = await fetch("/api/agents/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (res.status === 401) {
        router.push("/login?next=/school");
        return;
      }
      const data = (await res.json()) as { taskId?: string };
      if (res.ok && data.taskId) setActiveAgentTask(data.taskId, prompt.slice(0, 80), prompt);
    } catch { /* ошибка не должна блокировать повторный запуск */ }
    finally { setStarting(false); }
  }

  const running = Boolean(task) && (status === "running" || status === "connecting");

  return (
    <div className="flex h-full min-h-0">
      {/* ── Левая колонка: чат ── */}
      <section aria-label="Чат с агентом" className={`${mobileWorkspaceOpen ? "hidden" : "flex"} w-full min-w-0 shrink-0 flex-col border-r border-white/10 bg-[#0b0d13] lg:flex lg:w-[420px]`}>
        <header className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5">
          <h1 className="text-sm font-bold text-slate-100">Новый чат</h1>
          <button type="button" onClick={() => { setTab("os"); setMobileWorkspaceOpen(true); }} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-400/10 px-2 py-1 text-[11px] font-semibold text-sky-200 lg:hidden">
            <LayoutGrid className="size-3.5" /> Открыть ОС
          </button>
          <span
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-slate-300"
            title="Модель подбирается автоматически с фоллбэком: Gemini → Groq → OpenAI"
          >
            Агент Mekty <ChevronDown className="size-3 text-slate-500" />
          </span>
        </header>

        {/* User control stays obvious while the AI is paused. */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 pb-2.5">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${control === "user" ? "text-sky-300" : "text-emerald-300"}`}>
            <span className={`inline-block size-2 rounded-full ${control === "user" ? "bg-sky-400" : "animate-pulse bg-emerald-400"}`} />
            {!controlLoaded ? "ПРОВЕРЯЮ СОСТОЯНИЕ" : control === "user" ? "ВЫ УПРАВЛЯЕТЕ" : "AI РАБОТАЕТ"}
          </span>
          {control === "ai" ? (
            <button
              type="button"
              onClick={() => void setControl("user")}
              className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-300 hover:bg-sky-500/20"
            >
              Забрать управление себе
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void setControl("ai")}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20"
            >
              Передать управление ИИ
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
          {task ? (
            <>
              <p className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm bg-sky-600 px-3.5 py-2.5 text-sm leading-snug text-white shadow-lg shadow-sky-950/40">
                {task.prompt ?? task.title}
              </p>
              <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
                  <Bot className="size-4 text-emerald-400" />
                  <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-200">Агент Mekty</p>
                  <StatusDot status={status} />
                </div>
                <PermissionCard active={status === "running"} />
                <AgentSession taskId={task.id} variant="chat" onStatus={setStatus} />
              </div>
              {(status === "running" || status === "connecting") && (
                <button
                  type="button"
                  onClick={() => void stopTask()}
                  disabled={stopping}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  {stopping ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />} Отменить задачу
                </button>
              )}
            </>
          ) : (
            <div className="space-y-3 pt-2">
              <p className="rounded-2xl bg-white/5 px-3.5 py-2.5 text-sm leading-6 text-slate-300">
                Опишите задачу внизу — агент выполнит её по-настоящему: команды в песочнице, файлы, страницы.
              </p>
              <p className="px-1 text-sm leading-6 text-white/40">
                Здесь появится план и пошаговый ход работы: команды, файлы, страницы.
              </p>
              <Link href="/school/agents" className="inline-block px-1 text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline">
                История задач →
              </Link>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 p-3">
          <AgentComposer />
        </div>
      </section>

      {/* ── Правая колонка: ОС ── */}
      <section
        aria-label="Рабочая область ОС"
        className={
          fullscreen
            ? "fixed inset-0 z-[80] flex min-w-0 flex-1 flex-col bg-[#0a0a1c]"
            : `${mobileWorkspaceOpen ? "flex" : "hidden"} min-w-0 flex-1 flex-col lg:flex`
        }
      >
        {/* Переключатель панелей. Раньше это были просто кнопки без ролей:
            для скринридера они не читались как вкладки, и найти их можно было
            только по подписи. */}
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-white/10 bg-[#0b0d13] px-2">
        <div role="tablist" aria-label="Приложения рабочей области" className="flex items-center gap-1">
          {visibleTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors ${tab === id ? "bg-white/10 font-semibold text-white" : "text-slate-400 hover:bg-white/5"}`}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Добавить вкладку"
              aria-expanded={menuOpen}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
            >
              <Plus className="size-4" />
            </button>
            {menuOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#12141c] py-1 shadow-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setExtraTabs((prev) => (prev.includes("log") ? prev : [...prev, "log"]));
                    setTab("log");
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5"
                >
                  <ScrollText className="size-3.5" /> Журнал задачи
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void (async () => {
                      try {
                        const res = await fetch("/api/agents/snapshots", { method: "POST" });
                        const data = await res.json() as { error?: string };
                        if (!res.ok) throw new Error(data.error ?? "Не удалось создать снимок");
                        setNotice("Снимок рабочей области создан");
                      } catch (error) {
                        setNotice(error instanceof Error ? error.message : "Не удалось создать снимок");
                      }
                    })();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5"
                >
                  <Archive className="size-3.5" /> Снимок рабочей области
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void (async () => {
                      const res = await fetch("/api/agents/snapshots");
                      const data = (await res.json()) as { snapshots?: { id: string }[] };
                      const last = data.snapshots?.[0];
                      if (!last) { setNotice("Снапшотов пока нет"); return; }
                      await fetch("/api/agents/snapshots", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: last.id }) });
                      setNotice(`Рабочая область восстановлена из снимка ${last.id.slice(0, 16)}`);
                    })();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5"
                >
                  <Undo2 className="size-3.5" /> Восстановить последний снимок
                </button>
                <Link
                  href="/school/workspace"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5"
                >
                  <LayoutGrid className="size-3.5" /> Рабочий стол на весь экран
                </Link>
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1">
            {tab === "os" && (
              <span className="hidden items-center gap-1.5 px-2 text-[10px] font-medium text-emerald-300 sm:inline-flex" title="Рабочий стол открыт; вы можете управлять окнами вручную">
                <span className="size-1.5 rounded-full bg-emerald-400" /> ОС включена · ручное управление
              </span>
            )}
            <button type="button" onClick={() => setMobileWorkspaceOpen(false)} className="rounded-lg px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10 lg:hidden">Чат агента</button>
            {task?.prompt && (
            <button
              type="button"
              onClick={() => void startLast()}
              disabled={!task?.prompt || starting || running}
              title="Повторить последнюю задачу агента"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/10 disabled:opacity-40"
            >
              {starting ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Повторить задачу
            </button>
            )}
            {task && (
            <button
              type="button"
              onClick={() => void stopTask()}
              disabled={!task || !running || stopping}
              title="Остановить активную задачу"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-40"
            >
              {stopping ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />} Остановить задачу
            </button>
            )}
            <button
              type="button"
              onClick={() => setFullscreen((v) => !v)}
              className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
              aria-label={fullscreen ? "Свернуть ОС" : "Развернуть ОС"}
            >
              {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
            {fullscreen && (
              <button
                type="button"
                onClick={() => setFullscreen(false)}
                className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                aria-label="Закрыть область"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Дочерние приложения (особенно WorkspaceSurface) используют flex-1;
            без flex-контейнера ОС схлопывалась до высоты сетки иконок, оставляя
            большую пустую полосу внизу рабочей области. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {tab === "os" && <WorkspaceSurface />}
          {tab === "browser" && <BrowserApp />}
          {tab === "files" && <FileManagerApp />}
          {tab === "terminal" && <TerminalApp />}
          {tab === "editor" && <CodeEditorApp requestedFile={editorFile} />}
          {tab === "log" && (
            task ? (
              <div className="flex h-full flex-col bg-[#0d1117]">
                <AgentSession taskId={task.id} onStatus={setStatus} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-white/45">
                Журнал появится, когда вы запустите задачу агенту.
              </div>
            )
          )}
        </div>

        {/* Статус-бар: реальная машина и таймер работы задачи */}
        <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-white/10 bg-[#0b0d13] px-3 text-[11px] text-slate-400">
          <span className="truncate">{notice ?? (sysInfo || "Mekty Machine")}</span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <span className={`inline-block size-1.5 rounded-full ${task && status === "running" ? "bg-emerald-400" : "bg-slate-600"}`} />
            {task && status === "running" ? (elapsed ? `Работает ${elapsed}` : "Работает") : "Ожидание"}
          </span>
        </footer>
      </section>
    </div>
  );
}
