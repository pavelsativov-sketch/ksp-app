"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, CircleCheck, CircleX, Globe, Lock, ExternalLink, FileText, Download, Presentation } from "lucide-react";
import { currentActivity, extractDeliverables, extractTaskFiles, finalSummary } from "@/lib/agents/deliverables";
import { useWorkspaceStore } from "@/lib/store/workspace";
import { useOsShellStore } from "@/lib/store/os-shell";

export interface AgentEvent {
  type: string;
  message: string;
  data?: {
    tool?: string;
    args?: Record<string, unknown>;
    result?: string;
    url?: string;
    authBarrier?: { requiresUserAction?: boolean; kind?: string | null; reason?: string; domain?: string };
  } | null;
  createdAt?: string | null;
}

type Status = "queued" | "running" | "completed" | "failed" | "stopped";

/**
 * Живой лог сессии агента: подписка на SSE-поток /api/agents/task/[id],
 * события рендерятся по мере появления (реальное время).
 */
export type AgentStatus = Status;

type AgentSessionProps = {
  taskId: string;
  /** compact — тёмный лог внутри ОС; chat — тот же поток в чатовой панели. */
  variant?: "compact" | "chat";
  onStatus?: (s: AgentStatus) => void;
  onBrowserActivity?: (info: { url: string; requiresUserAction?: boolean; reason?: string }) => void;
};

export function AgentSession(props: AgentSessionProps) {
  return (
    <AgentSessionStream
      key={props.taskId}
      taskId={props.taskId}
      onStatus={props.onStatus}
      onBrowserActivity={props.onBrowserActivity}
    />
  );
}

function AgentSessionStream({
  taskId,
  onStatus,
  onBrowserActivity,
}: Pick<AgentSessionProps, "taskId" | "onStatus" | "onBrowserActivity">) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<Status>("running");
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const onBrowserActivityRef = useRef(onBrowserActivity);

  useEffect(() => {
    onBrowserActivityRef.current = onBrowserActivity;
  }, [onBrowserActivity]);

  useEffect(() => {
    const es = new EventSource(`/api/agents/task/${taskId}`);
    let final = false;

    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as AgentEvent & { status?: string };
        if (ev.type === "STATUS_UPDATE") {
          if (ev.status === "queued") {
            // Задача стоит в очереди: ждём, когда запустится.
            setStatus("queued");
            return;
          }
          if (ev.status === "running") {
            setStatus("running");
            return;
          }
          setStatus(ev.status === "failed" ? "failed" : ev.status === "stopped" ? "stopped" : "completed");
          final = true;
          es.close();
          return;
        }
        if (ev.type === "ERROR" && ev.message === "Задача не найдена") {
          setStatus("failed");
          final = true;
          es.close();
          return;
        }
        setEvents((prev) => [...prev.slice(-400), ev]);

        if (ev.type === "TOOL_CALL" && ev.data?.tool === "browserNavigate") {
          const targetUrl = typeof ev.data?.args?.url === "string" ? ev.data.args.url : "";
          if (targetUrl) {
            onBrowserActivityRef.current?.({ url: targetUrl });
          }
        } else if (ev.type === "TOOL_RESULT" && (ev.data?.tool === "browserNavigate" || ev.data?.tool === "browserClick" || ev.data?.tool === "browserType") && ev.data?.result) {
          try {
            const parsed = JSON.parse(ev.data.result) as {
              success?: boolean;
              url?: string;
              authBarrier?: { requiresUserAction?: boolean; kind?: string | null; reason?: string };
            };
            if (parsed.success && parsed.url) {
              onBrowserActivityRef.current?.({
                url: parsed.url,
                requiresUserAction: parsed.authBarrier?.requiresUserAction,
                reason: parsed.authBarrier?.reason,
              });
            }
          } catch { /* ignore */ }
        } else if (ev.type === "PAUSED" && ev.data?.authBarrier?.requiresUserAction) {
          onBrowserActivityRef.current?.({
            url: ev.data.url || "",
            requiresUserAction: true,
            reason: ev.data.authBarrier.reason,
          });
        }

        if (ev.type === "END") {
          setStatus(ev.message === "Остановлено пользователем" ? "stopped" : "completed");
          final = true;
          es.close();
        }
      } catch {
        // некорректный кадр — пропускаем
      }
    };
    es.onerror = () => {
      if (final) { es.close(); return; }
      setStatus((prev) => (prev === "running" ? "running" : "queued"));
    };
    es.onopen = () => setStatus("running");

    return () => es.close();
  }, [taskId]);

  useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const metaEv = events.find((e) => e.type === "META") as unknown as (AgentEvent & { plan?: string[] }) | undefined;
  const plan = metaEv?.plan ?? (metaEv?.data as unknown as { plan?: string[] } | undefined)?.plan ?? null;
  // Шагом считается только удачный результат инструмента: ошибки («сеанс истёк»,
  // «нет квоты») раньше засчитывались, и остановленная задача показывала 100%.
  const doneSteps = events.filter((e) => e.type === "TOOL_RESULT" && !/"success"\s*:\s*false/.test(String(e.data?.result ?? ""))).length;
  const progress = plan && plan.length
    ? status === "completed" ? 100 : Math.min(95, Math.round((doneSteps / plan.length) * 100))
    : null;
  const running = status === "running";
  // Созданные агентом КСП и КТП: готовые ссылки, чтобы не искать результат в логе.
  const deliverables = extractDeliverables(events);
  const taskFiles = extractTaskFiles(events);
  const activity = running ? currentActivity(events) : "";
  const summary = status === "completed" ? finalSummary(events) : "";
  const openInEditor = useWorkspaceStore((s) => s.openInEditor);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {activity && (
        <p role="status" className="mx-3 mt-3 flex shrink-0 items-start gap-2 rounded-lg border border-sky-400/20 bg-sky-400/[0.07] px-3 py-2 text-[11px] leading-snug text-sky-100">
          <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin" />
          <span><span className="font-semibold">Сейчас:</span> {activity}</span>
        </p>
      )}
      {summary && (
        <section aria-label="Итог задачи" className="mx-3 mt-3 shrink-0 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-200"><CircleCheck className="size-3.5 text-emerald-400" /> Итог</p>
          <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-300">{summary}</p>
        </section>
      )}
      {deliverables.length > 0 && (
        <section aria-label="Результат работы агента" className="mx-3 mt-3 shrink-0 space-y-2">
          {deliverables.map((item) => (
            <div key={`${item.kind}:${item.url}`} className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                <FileText className="size-3.5" /> {item.kind === "ksp" ? "Готов КСП" : "Готов КТП"}
              </p>
              <p className="mt-1 text-[12px] leading-snug text-slate-100">{item.title}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-slate-950 hover:bg-emerald-400">
                  <ExternalLink className="size-3" /> Открыть
                </a>
                {item.docxUrl && (
                  <a href={item.docxUrl} className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/10">
                    <Download className="size-3" /> Word
                  </a>
                )}
                {item.pptxUrl && (
                  <a href={item.pptxUrl} className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/10">
                    <Presentation className="size-3" /> PowerPoint
                  </a>
                )}
              </div>
              {item.workspaceFile && <p className="mt-1.5 text-[10px] text-slate-400">Копия в файлах рабочей области: {item.workspaceFile}</p>}
            </div>
          ))}
        </section>
      )}
      {taskFiles.length > 0 && (
        <section aria-label="Файлы задачи" className="mx-3 mt-3 shrink-0">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Файлы задачи</p>
          <div className="flex flex-wrap gap-1.5">
            {taskFiles.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => openInEditor(name)}
                title={`Открыть «${name}» в редакторе`}
                className="inline-flex max-w-full items-center gap-1 rounded-lg border border-white/12 bg-white/[0.05] px-2 py-1 font-mono text-[11px] text-slate-200 hover:bg-white/10"
              >
                <FileText className="size-3 shrink-0 text-sky-300" /> <span className="truncate">{name}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {plan && plan.length > 0 && (
        <div className="mx-3 mt-3 shrink-0 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              {running ? <Loader2 className="size-3.5 animate-spin" />
                : status === "completed" ? <CircleCheck className="size-3.5 text-emerald-400" />
                  : <CircleX className={`size-3.5 ${status === "failed" ? "text-red-400" : "text-slate-400"}`} />}
              {running ? "Выполняю задачу…"
                : status === "completed" ? "Задача выполнена"
                  : status === "failed" ? "Задача не выполнена" : "Задача остановлена"}
            </p>
            {progress !== null && <span className="text-xs text-slate-400">{progress}%</span>}
          </div>
          {progress !== null && (
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          <ul className="space-y-1.5 text-[11px] leading-snug">
            {plan.map((step, idx) => {
              const stepDone = status === "completed" || (status !== "stopped" && status !== "failed" ? idx < doneSteps : idx < Math.min(doneSteps, plan.length - 1));
              const stepCurrent = running && idx === doneSteps;
              return (
                <li key={idx} className={`flex items-start gap-2 ${stepDone ? "text-slate-400" : stepCurrent ? "text-slate-100" : "text-slate-500"}`}>
                  {stepDone ? <CircleCheck className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                    : stepCurrent ? <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin text-sky-300" />
                    : <span className="mt-0.5 size-3 shrink-0 rounded-full border border-white/25" />}
                  <span className="flex-1">{step}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed"
      >
        {events.length === 0 && running && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Агент запускается…
          </p>
        )}
        {events.filter((e) => e.type !== "META").map((ev, i) => (
          <EventLine key={i} ev={ev} previewIndex={i} />
        ))}
        {status === "completed" && (
          <p className="flex items-center gap-1.5 pt-1 text-emerald-400"><CircleCheck className="size-3.5" /> Задача завершена</p>
        )}
        {status === "failed" && (
          <p className="flex items-center gap-1.5 pt-1 text-red-400"><CircleX className="size-3.5" /> Задача завершилась с ошибкой</p>
        )}
        {status === "stopped" && (
          <p className="flex items-center gap-1.5 pt-1 text-slate-400"><CircleX className="size-3.5" /> Задача остановлена</p>
        )}
      </div>
    </div>
  );
}

function EventLine({ ev, previewIndex }: { ev: AgentEvent; previewIndex: number }) {
  const setTab = useOsShellStore((s) => s.setTab);
  const tool = ev.data?.tool;
  if (ev.type === "THINK") {
    return <p className="text-muted-foreground/70 italic">· {ev.message}</p>;
  }
  if (ev.type === "REASONING") {
    return <p className="whitespace-pre-wrap text-slate-400">{ev.message}</p>;
  }
  if (ev.type === "PAUSED") {
    return (
      <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-2.5 font-sans text-xs text-amber-100">
        <div className="flex items-start gap-2">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-snug">{ev.message}</p>
            <button
              type="button"
              onClick={() => setTab("browser")}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-400/20 px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-400/30"
            >
              <Globe className="size-3" /> Открыть экран в рабочей области ОС →
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (ev.type === "TOOL_CALL") {
    if (tool === "executeCommand" || tool === "runCommand") {
      return (
        <p className="rounded bg-black/40 px-2 py-1 text-emerald-300">
          <span className="text-emerald-500">$</span> {ev.message.replace(/^\$ /, "")}
        </p>
      );
    }
    if (tool === "browserNavigate") {
      return <p className="text-sky-300">🌐 {ev.message}</p>;
    }
    if (tool === "writeFile" || tool === "readFile" || tool === "listFiles") {
      return <p className="text-amber-300">📄 {ev.message}</p>;
    }
    return <p className="text-slate-300">⚙ {ev.message}</p>;
  }
  if (ev.type === "TOOL_RESULT") {
    const out = extractResult(ev);
    const browserInfo = extractBrowserMeta(ev);
    if (!out && !browserInfo) return null;
    return (
      <div className="space-y-1.5">
        {out && (
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-black/30 px-2 py-1 text-slate-300">
            {out}
          </pre>
        )}
        {browserInfo && (
          <div className="overflow-hidden rounded-xl border border-white/10 bg-[#111420] font-sans">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-2.5 py-1.5 text-[11px]">
              <span className="flex min-w-0 items-center gap-1.5 truncate text-slate-300">
                <Globe className="size-3 shrink-0 text-sky-400" />
                <span className="truncate">{browserInfo.title || browserInfo.url}</span>
              </span>
              <button
                type="button"
                onClick={() => setTab("browser")}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-300 hover:bg-sky-500/25"
              >
                В рабочей области ОС <ExternalLink className="size-2.5" />
              </button>
            </div>
            {browserInfo.authBarrier?.requiresUserAction && (
              <div className="flex items-center gap-1.5 border-b border-amber-400/20 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
                <Lock className="size-3 shrink-0 text-amber-300" />
                <span>
                  {browserInfo.authBarrier.reason || "Для входа кликните по полю логина/пароля прямо в рабочей области ОС справа."}
                </span>
                {browserInfo.authBarrier.kind === "login" && (
                  <button
                    type="button"
                    onClick={() => setTab("browser")}
                    className="ml-auto shrink-0 rounded-md bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold text-amber-100 hover:bg-amber-400/30"
                  >
                    Ввести данные
                  </button>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setTab("browser")}
              title="Перейти к интерактивному экрану в рабочей области ОС"
              className="block w-full bg-black/40 text-left"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/agents/browser-stream?action=screenshot&v=${previewIndex}`}
                alt={browserInfo.title || "Снимок страницы в браузере ОС"}
                className="max-h-44 w-full object-cover object-top opacity-90 transition-opacity hover:opacity-100"
              />
            </button>
          </div>
        )}
      </div>
    );
  }
  if (ev.type === "END") {
    return <p className="whitespace-pre-wrap rounded bg-emerald-500/10 px-2 py-1 text-emerald-300">✓ {ev.message}</p>;
  }
  if (ev.type === "ERROR") {
    return <p className="whitespace-pre-wrap rounded bg-red-500/10 px-2 py-1 text-red-300">✗ {ev.message}</p>;
  }
  if (ev.type === "WARNING") {
    return <p className="whitespace-pre-wrap rounded bg-amber-500/10 px-2 py-1 text-amber-300">⚠ {ev.message}</p>;
  }
  return <p className="text-muted-foreground">{ev.message}</p>;
}

function extractBrowserMeta(ev: AgentEvent): {
  url?: string;
  title?: string;
  authBarrier?: { requiresUserAction?: boolean; kind?: string | null; reason?: string };
} | null {
  if (ev.data?.tool !== "browserNavigate" || !ev.data?.result) return null;
  try {
    const parsed = JSON.parse(ev.data.result) as {
      success?: boolean;
      url?: string;
      title?: string;
      authBarrier?: { requiresUserAction?: boolean; kind?: string | null; reason?: string };
    };
    if (!parsed.success) return null;
    return {
      url: parsed.url,
      title: parsed.title,
      authBarrier: parsed.authBarrier,
    };
  } catch {
    return null;
  }
}

function extractResult(ev: AgentEvent): string | null {
  const raw = ev.data?.result;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { output?: string; error?: string; title?: string; content?: string; files?: string[]; message?: string };
    if (ev.data?.tool === "browserNavigate") {
      return parsed.title ? `${parsed.title}\n${(parsed.content ?? "").slice(0, 300)}` : parsed.error ?? null;
    }
    if (parsed.files) return parsed.files.join("\n");
    return parsed.output ?? parsed.content ?? parsed.error ?? parsed.message ?? null;
  } catch {
    return raw.slice(0, 300);
  }
}

export function StatusDot({ status }: { status: Status }) {
  const color = status === "running" ? "bg-amber-400 animate-pulse" : status === "queued" ? "bg-sky-400" : status === "completed" ? "bg-emerald-400" : status === "failed" ? "bg-red-400" : "bg-slate-400";
  return <span className={`inline-block size-2 rounded-full ${color}`} aria-hidden />;
}

