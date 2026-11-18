"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot, ChevronRight, Loader2, Maximize2, Minimize2, Play, Plus, Square, X,
  FolderOpen, Globe, LayoutGrid, ScrollText, TerminalSquare, FileCode, Archive, Undo2,
  BarChart3, ClipboardList, UserRound, Users, Target, SquarePen,
} from "lucide-react";
import { AgentComposer } from "@/components/agents/agent-composer";
import { clearActiveAgentTask, fetchTasksShared, setActiveAgentTask, useActiveAgentTask } from "@/components/agents/agent-dock";
import { AgentSession, StatusDot, type AgentStatus } from "@/components/agents/agent-session";
import { CodeEditorApp } from "@/components/workspace/apps/code-editor";
import { PermissionCard } from "@/components/agents/permission-card";
import { useOsShellStore, type OsTab } from "@/lib/store/os-shell";
import { useWorkspaceStore } from "@/lib/store/workspace";
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
  { id: "os", label: "Рабочее место", icon: LayoutGrid },
  { id: "browser", label: "Браузер", icon: Globe },
  { id: "files", label: "Файлы", icon: FolderOpen },
];

const BILIMCLASS_URL = "https://www.bilimclass.kz/2026/frontoffice/dashboard";

/** Готовые конструкторы на стартовом экране чата. */
const BUILDERS = [
  { href: "/school/sor-soch", icon: BarChart3, title: "Анализ СОР и СОЧ", hint: "Ввод баллов списком → расчёт качества и отчёт завучу" },
  { href: "/school/vsk", icon: ClipboardList, title: "Справки ВШК", hint: "Конструктор аналитических справок по урокам и проверкам" },
  { href: "/school/characteristics", icon: UserRound, title: "Характеристики", hint: "На ученика, класс, для ПМПК и органов опеки" },
  { href: "/school/homeroom", icon: Users, title: "Классное руководство", hint: "Родительские собрания: повестка, доклад, протокол" },
  { href: "/school/iom", icon: Target, title: "Маршруты ИОМ", hint: "Индивидуальный план ликвидации пробелов знаний" },
] as const;

/** Для тех, кому нужно больше: добавляются кнопкой «Ещё». */
const EXTRA_TABS: TabDef[] = [
  { id: "editor", label: "Редактор", icon: FileCode },
  { id: "terminal", label: "Терминал", icon: TerminalSquare },
  { id: "log", label: "Журнал задачи", icon: ScrollText },
];

const TaskElapsedBadge = memo(function TaskElapsedBadge({
  taskId,
  active,
  initialStartedAt,
}: {
  taskId: string;
  active: boolean;
  initialStartedAt?: number;
}) {
  const [elapsed, setElapsed] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    let iv: ReturnType<typeof setInterval> | undefined;

    const startTimer = (startedMs: number) => {
      const fmt = (ms: number) => {
        const s = Math.max(0, Math.floor(ms / 1000));
        return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
      };
      setElapsed(fmt(Date.now() - startedMs));
      iv = setInterval(() => {
        if (alive) setElapsed(fmt(Date.now() - startedMs));
      }, 1000);
    };

    if (initialStartedAt && Number.isFinite(initialStartedAt)) {
      const kick = setTimeout(() => {
        if (alive) startTimer(initialStartedAt);
      }, 0);
      return () => {
        alive = false;
        clearTimeout(kick);
        if (iv) clearInterval(iv);
      };
    }

    void fetchTasksShared(1500)
      .then((data) => {
        if (!alive) return;
        const found = data?.tasks?.find((t) => t.id === taskId);
        if (!found?.createdAt) return;
        const parsed = new Date(found.createdAt).getTime();
        if (Number.isFinite(parsed)) startTimer(parsed);
      })
      .catch(() => { /* таймер некритичен */ });

    return () => {
      alive = false;
      if (iv) clearInterval(iv);
    };
  }, [taskId, active, initialStartedAt]);

  if (!active || !elapsed) return null;
  return (
    <span className="hidden items-center gap-1.5 px-2 text-xs font-semibold tabular-nums text-muted-foreground md:inline-flex">
      <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
      Работает {elapsed}
    </span>
  );
});

/**
 * Рабочая область как в референсе: слева чат с агентом (пузырь запроса,
 * план-чеклист, прогресс, отмена задачи), справа — рабочий стол с вкладками
 * приложений, режимом ручного управления и отдельными действиями задачи.
 */
export function SchoolWorkspace({
  initialTab = "os",
  openComputerUse = false,
  initialUrl,
}: {
  /** Больше не выводится здесь (есть общая строка состояния); оставлен для совместимости вызовов. */
  sysInfo?: string;
  initialTab?: OsTab;
  openComputerUse?: boolean;
  /** Deep-link URL to open immediately in the browser tab (e.g., from connectors page). */
  initialUrl?: string;
}) {
  const router = useRouter();
  const task = useActiveAgentTask();
  const tab = useOsShellStore((s) => s.tab);
  const setTab = useOsShellStore((s) => s.setTab);
  const [extraTabs, setExtraTabs] = useState<OsTab[]>(() => (
    EXTRA_TABS.some((t) => t.id === initialTab) ? [initialTab] : []
  ));
  const [visitedTabs, setVisitedTabs] = useState<OsTab[]>(() => [initialTab]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileWorkspaceOpen, setMobileWorkspaceOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState<AgentStatus>("completed");
  const [control, setControlState] = useState<"user" | "ai">("user");
  const [controlLoaded, setControlLoaded] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [editorFile, setEditorFile] = useState<string | null>(null);
  const [browserUrl, setBrowserUrl] = useState<string | undefined>(initialUrl);
  const [notice, setNotice] = useState<string | null>(null);
  const menuBoxRef = useRef<HTMLDivElement>(null);

  const activateTab = useCallback((next: OsTab) => {
    setVisitedTabs((prev) => (prev.includes(next) ? prev : [...prev, next]));
    if (EXTRA_TABS.some((t) => t.id === next)) {
      setExtraTabs((prev) => (prev.includes(next) ? prev : [...prev, next]));
    }
    setTab(next);
  }, [setTab]);

  const running = Boolean(task) && status === "running";

  // «В редактор» из файл-менеджера: в двухпанельной раскладке редактор — это
  // вкладка, а не окно, поэтому переключаем вкладку по изменению editorOpenSeq
  // даже если пользователь повторно нажал на тот же файл.
  useEffect(() => {
    return useWorkspaceStore.subscribe((state, prev) => {
      const now = state.windows.find((w) => w.type === "code-editor")?.file;
      const before = prev.windows.find((w) => w.type === "code-editor")?.file;
      if (now && (now !== before || state.editorOpenSeq !== prev.editorOpenSeq)) {
        setEditorFile(now);
        activateTab("editor");
        setMobileWorkspaceOpen(true);
      }
    });
  }, [activateTab]);

  // Переключение вкладки из компактного лога / чата агента с поддержкой мобильного экрана.
  useEffect(() => {
    const onOpenTab = (ev: Event) => {
      const next = (ev as CustomEvent<{ tab?: OsTab }>).detail?.tab;
      if (!next) return;
      activateTab(next);
      setMobileWorkspaceOpen(true);
    };
    window.addEventListener("mekty:open-workspace-tab", onOpenTab);
    return () => window.removeEventListener("mekty:open-workspace-tab", onOpenTab);
  }, [activateTab]);

  // Закрытие меню «Ещё» по клику снаружи и Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuBoxRef.current && !menuBoxRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // Владелец управления: опрос идёт только пока задача активно работает.
  useEffect(() => {
    if (!running) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const poll = async () => {
      if (!alive) return;
      if (document.hidden) {
        timer = setTimeout(() => void poll(), 4000);
        return;
      }
      try {
        const res = await fetch("/api/agents/control", { cache: "no-store", signal: controller.signal });
        if (res.ok && alive) {
          const data = (await res.json()) as { control?: "user" | "ai"; pendingCount?: number };
          if (data.control) setControlState(data.control);
          if (typeof data.pendingCount === "number") setPendingCount(data.pendingCount);
          setControlLoaded(true);
        }
      } catch { /* некритично */ }
      if (alive) timer = setTimeout(() => void poll(), 4000);
    };

    void poll();
    return () => {
      alive = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [running]);

  const setControl = async (mode: "user" | "ai") => {
    setNotice(null);
    try {
      const response = await fetch("/api/agents/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ control: mode }) });
      if (!response.ok) throw new Error("Не удалось передать управление");
      setControlState(mode);
    } catch { setNotice("Не удалось изменить режим управления. Проверьте соединение."); }
  };

  const appliedInitialTabRef = useRef<OsTab | null>(null);
  const appliedComputerUseRef = useRef(false);

  // Deep-link `?os=files` или `?os=computer-use` из серверной страницы —
  // применяем ровно один раз при входе/смене query, чтобы перерендер не сбрасывал выбранную вкладку.
  useEffect(() => {
    if (initialTab && appliedInitialTabRef.current !== initialTab) {
      appliedInitialTabRef.current = initialTab;
      setTab(initialTab);
    }
    if (openComputerUse && !appliedComputerUseRef.current) {
      appliedComputerUseRef.current = true;
      useWorkspaceStore.getState().openWindow("computer-use", "Работа с компьютером", "computer-use");
      router.push("/school/workspace?os=computer-use");
    }
  }, [initialTab, openComputerUse, router, setTab]);

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
    if (!prompt || starting || status === "running" || status === "queued") return;
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

  const idle = tab === "os";
  const isMounted = (id: OsTab) => tab === id || visitedTabs.includes(id);

  return (
    <div className="flex h-full min-h-0 gap-3 p-3 pl-0">
      {/* ── Слева: задача и ход работы ── */}
      <section aria-label="Чат с агентом" className={`${mobileWorkspaceOpen ? "hidden" : "flex"} w-full min-w-0 shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card lg:flex lg:w-[clamp(340px,32vw,430px)]`}>
        <header className="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
          <h1 className="text-lg font-extrabold tracking-tight">ИИ-ассистент</h1>
          <div className="flex items-center gap-1.5">
            {task && !running && (
              <button type="button" onClick={() => clearActiveAgentTask()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-soft px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary-soft-hover">
                <SquarePen className="size-3.5" /> Новая задача
              </button>
            )}
            <button type="button" onClick={() => setMobileWorkspaceOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold lg:hidden">
              <Globe className="size-3.5" /> Рабочее место
            </button>
          </div>
        </header>

        {running && controlLoaded && (
          <div className="mx-3 mb-2 flex shrink-0 items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold">
              <span className={`inline-block size-2 rounded-full ${control === "user" ? "bg-primary" : "animate-pulse bg-emerald-500"}`} />
              {control === "user" ? "ВЫ УПРАВЛЯЕТЕ" : "ИИ РАБОТАЕТ"}
            </span>
            <button type="button" onClick={() => void setControl(control === "ai" ? "user" : "ai")} className="rounded-lg bg-surface px-2.5 py-1 text-xs font-bold text-primary shadow-sm hover:bg-primary-soft">
              {control === "ai" ? "Забрать управление себе" : "Передать управление ИИ"}
            </button>
          </div>
        )}

        {pendingCount > 0 && (
          <div role="status" className="mx-3 mb-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-1.5 text-xs font-semibold text-warning">
            Агент ждёт вашего решения ({pendingCount}): разрешите или отклоните действие ниже.
          </div>
        )}
        <PermissionCard active={status === "running"} />

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
          {task ? (
            <>
              <p className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm leading-snug text-white">
                {task.prompt ?? task.title}
              </p>
              <div className="overflow-hidden rounded-xl bg-background/60">
                <div className="flex items-center gap-2 px-3 pt-2.5">
                  <Bot className="size-4 text-primary" />
                  <p className="min-w-0 flex-1 truncate text-sm font-bold">Агент Mekty</p>
                  <StatusDot status={status} />
                </div>
                <AgentSession
                  taskId={task.id}
                  variant="chat"
                  onStatus={setStatus}
                  onBrowserActivity={({ requiresUserAction, reason }) => {
                    // Адрес не передаём: страницу уже открыл агент, вкладка только смотрит.
                    activateTab("browser");
                    if (requiresUserAction) {
                      setControlState("user");
                      setMobileWorkspaceOpen(true);
                      if (reason) setNotice(reason);
                    }
                  }}
                />
              </div>
            </>
          ) : (
            <div className="space-y-3 pt-1">
              <p className="px-1 text-sm leading-relaxed text-muted-foreground">
                Опишите задачу своими словами или возьмите готовый конструктор. Агент покажет шаги и результат.
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {BUILDERS.map(({ href, icon: Icon, title, hint }) => (
                  <Link key={href} href={href} className="group flex items-center gap-3 rounded-xl border border-border p-2.5 transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary-soft/50">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary transition-transform group-hover:scale-110"><Icon className="size-[18px]" /></span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm font-bold">{title}</strong>
                      <span className="block text-xs leading-snug text-muted-foreground">{hint}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
              <Link href="/school/agents" className="block px-1 text-xs font-semibold text-primary hover:underline">История задач</Link>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border p-3">
          <AgentComposer compact={Boolean(task)} running={running} stopping={stopping} onStop={() => void stopTask()} />
        </div>
      </section>

      {/* ── Справа: рабочее место агента ── */}
      <section
        aria-label="Рабочая область ОС"
        data-os-fullscreen={fullscreen ? "true" : undefined}
        className={
          fullscreen
            ? "fixed inset-0 z-[80] flex min-w-0 flex-1 flex-col bg-background"
            : `${mobileWorkspaceOpen ? "flex" : "hidden"} min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card lg:flex`
        }
      >
        <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
          <div role="tablist" aria-label="Приложения рабочей области" className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
            {visibleTabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-label={label}
                title={label}
                onClick={() => activateTab(id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${tab === id ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <Icon className="size-4" /> <span>{label}</span>
              </button>
            ))}
          </div>

          <div ref={menuBoxRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Добавить вкладку"
              aria-expanded={menuOpen}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-4" /> Ещё
            </button>
            {menuOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-60 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-popover">
                {EXTRA_TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { activateTab(id); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <Icon className="size-4 text-muted-foreground" /> {label}
                  </button>
                ))}
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
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <Archive className="size-4 text-muted-foreground" /> Снимок рабочей области
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void (async () => {
                      try {
                        const res = await fetch("/api/agents/snapshots");
                        const data = (await res.json()) as { snapshots?: { id: string }[]; error?: string };
                        if (!res.ok) throw new Error(data.error ?? "Не удалось получить список снимков");
                        const last = data.snapshots?.[0];
                        if (!last) { setNotice("Снимков пока нет"); return; }
                        const putRes = await fetch("/api/agents/snapshots", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: last.id }),
                        });
                        const putData = (await putRes.json().catch(() => ({}))) as { error?: string };
                        if (!putRes.ok) throw new Error(putData.error ?? "Не удалось восстановить снимок");
                        setNotice("Рабочая область восстановлена из снимка");
                        if (typeof window !== "undefined") {
                          window.dispatchEvent(new Event("mekty:workspace-files-changed"));
                        }
                      } catch (error) {
                        setNotice(error instanceof Error ? error.message : "Не удалось восстановить снимок");
                      }
                    })();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <Undo2 className="size-4 text-muted-foreground" /> Восстановить последний снимок
                </button>
                <Link href="/school/workspace?mode=desktop" onClick={() => setMenuOpen(false)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                  <LayoutGrid className="size-4 text-muted-foreground" /> Рабочий стол на весь экран
                </Link>
              </div>
            )}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {notice && <span className="hidden max-w-[320px] truncate px-2 text-xs text-muted-foreground xl:inline" title={notice}>{notice}</span>}
            {task && <TaskElapsedBadge taskId={task.id} active={running} initialStartedAt={task.startedAt} />}
            <button type="button" onClick={() => setMobileWorkspaceOpen(false)} className="rounded-lg px-2 py-1 text-xs font-semibold hover:bg-muted lg:hidden">Чат агента</button>
            {task?.prompt && (
              <button type="button" onClick={() => void startLast()} disabled={starting || running} title="Повторить последнюю задачу агента" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft disabled:opacity-40">
                {starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} <span className="hidden 2xl:inline">Повторить задачу</span>
              </button>
            )}
            {running && (
              <button type="button" onClick={() => void stopTask()} disabled={stopping} title="Остановить активную задачу" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger-soft disabled:opacity-40">
                {stopping ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />} <span className="hidden 2xl:inline">Остановить задачу</span>
              </button>
            )}
            <button type="button" onClick={() => setFullscreen((v) => !v)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={fullscreen ? "Свернуть ОС" : "Развернуть ОС"}>
              {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
            {fullscreen && (
              <button type="button" onClick={() => setFullscreen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Закрыть область">
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          {idle && (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto bg-gradient-to-br from-primary-soft/60 via-surface to-cyan-soft/40 p-6 text-center">
              <div className="flex size-36 shrink-0 items-center justify-center rounded-3xl border border-primary/15 bg-surface/80 shadow-card" aria-hidden>
                <svg viewBox="0 0 120 120" className="size-24 text-primary" fill="none">
                  <rect x="24" y="34" width="72" height="54" rx="18" className="fill-primary/10 stroke-current" strokeWidth="3.5" />
                  <line x1="60" y1="18" x2="60" y2="34" className="stroke-current" strokeWidth="3.5" strokeLinecap="round" />
                  <circle cx="60" cy="15" r="5" className="fill-emerald-400 stroke-current" strokeWidth="2.5" />
                  <circle cx="45" cy="57" r="6" className="fill-current" />
                  <circle cx="75" cy="57" r="6" className="fill-current" />
                  <path d="M46 73C51 78 69 78 74 73" className="stroke-current" strokeWidth="3.5" strokeLinecap="round" />
                  <rect x="14" y="50" width="10" height="22" rx="5" className="fill-primary/20 stroke-current" strokeWidth="3" />
                  <rect x="96" y="50" width="10" height="22" rx="5" className="fill-primary/20 stroke-current" strokeWidth="3" />
                </svg>
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight">{task && running ? "Агент работает" : "Рабочее место агента"}</h2>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                {task && running
                  ? "Ход работы слева. Когда агент откроет сайт, браузер появится здесь, и вы увидите каждое действие."
                  : "Дайте задачу слева. Агент откроет браузер прямо здесь, и вы увидите каждое действие. Управление можно забрать в любой момент."}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => { setBrowserUrl(BILIMCLASS_URL); activateTab("browser"); }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-button transition-transform hover:-translate-y-0.5 hover:bg-primary-hover">
                  <Globe className="size-4" /> Открыть BilimClass
                </button>
                <button type="button" onClick={() => activateTab("files")} className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-bold transition-transform hover:-translate-y-0.5">
                  <FolderOpen className="size-4" /> Мои файлы
                </button>
                <Link href="/school/workspace?mode=desktop" className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-bold transition-transform hover:-translate-y-0.5">
                  <LayoutGrid className="size-4" /> Рабочий стол ОС
                </Link>
              </div>
            </div>
          )}
          {isMounted("browser") && (
            <div className={tab === "browser" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
              <BrowserApp initialUrl={browserUrl} watchOnly={running} active={tab === "browser"} />
            </div>
          )}
          {isMounted("files") && (
            <div className={tab === "files" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
              <FileManagerApp />
            </div>
          )}
          {isMounted("terminal") && (
            <div className={tab === "terminal" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
              <TerminalApp />
            </div>
          )}
          {isMounted("editor") && (
            <div className={tab === "editor" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
              <CodeEditorApp requestedFile={editorFile} />
            </div>
          )}
          {tab === "log" && (
            task ? (
              <div className="flex h-full flex-col overflow-y-auto">
                <AgentSession taskId={task.id} variant="compact" onStatus={setStatus} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                Журнал появится, когда вы запустите задачу агенту.
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}
