"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, CircleCheck, CircleX, Globe, Lock, ExternalLink, FileText, Download, Presentation } from "lucide-react";
import { currentActivity, extractDeliverables, extractTaskFiles, finalSummary, partialSummary } from "@/lib/agents/deliverables";
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
    const isTerminal = (s: Status) => s === "completed" || s === "failed" || s === "stopped";
    es.onerror = () => {
      if (final) { es.close(); return; }
      setStatus((prev) => (isTerminal(prev) ? prev : prev === "running" ? "running" : "queued"));
    };
    es.onopen = () => setStatus((prev) => (isTerminal(prev) ? prev : "running"));

    return () => es.close();
  }, [taskId]);

  // Поток событий идёт через медленную базу и может долго молчать. Если задача уже
  // окончена, панель узнаёт это из списка задач сразу, а не висит на «Агент запускается…».
  useEffect(() => {
    let active = true;
    void fetch("/api/agents/task", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ tasks?: Array<{ id?: string; status?: string }> }>) : null))
      .then((data) => {
        const task = data?.tasks?.find((t) => t.id === taskId);
        if (active && (task?.status === "completed" || task?.status === "failed" || task?.status === "stopped")) setStatus(task.status);
      })
      .catch(() => {});
    return () => { active = false; };
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
  const summary = status === "completed" ? finalSummary(events) : "";
  // Модель могла завершить задачу ответом «не удалось»: это не успех, что бы ни говорил статус.
  const summaryFailed = /^(не удалось|не смог|невозможно)/i.test(summary);
  const finishedOk = status === "completed" && !summaryFailed;
  const progress = plan && plan.length
    ? finishedOk ? 100 : Math.min(95, Math.round((doneSteps / plan.length) * 100))
    : null;
  const running = status === "running";
  // Созданные агентом КСП и КТП: готовые ссылки, чтобы не искать результат в логе.
  const deliverables = extractDeliverables(events);
  const taskFiles = extractTaskFiles(events);
  const activity = running ? currentActivity(events) : "";
  // Незавершённая задача всё равно показывает, что сделано и где остановились.
  const partial = status === "failed" ? partialSummary(events) : "";
  const openInEditor = useWorkspaceStore((s) => s.openInEditor);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {activity && (
        <p role="status" className="mx-3 mt-3 flex shrink-0 items-start gap-2 rounded-lg border border-primary-soft-hover bg-primary-soft px-3 py-2 text-[13px] leading-snug text-primary">
          <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin" />
          <span><span className="font-semibold">Сейчас:</span> {activity}</span>
        </p>
      )}
      {summary && (
        <section aria-label="Итог задачи" className="mx-3 mt-3 shrink-0 rounded-xl border border-border bg-muted p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">{summaryFailed ? <CircleX className="size-3.5 text-amber-700" /> : <CircleCheck className="size-3.5 text-emerald-700" />} {summaryFailed ? "Итог: не выполнено" : "Итог"}</p>
          <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">{summary}</p>
        </section>
      )}
      {partial && (
        <section aria-label="Частичный итог задачи" className="mx-3 mt-3 shrink-0 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800"><CircleX className="size-3.5 text-amber-800" /> Частичный итог</p>
          <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">{partial}</p>
        </section>
      )}
      {deliverables.length > 0 && (
        <section aria-label="Результат работы агента" className="mx-3 mt-3 shrink-0 space-y-2">
          {deliverables.map((item) => (
            <div key={`${item.kind}:${item.url}`} className="rounded-xl border border-emerald-300 bg-emerald-50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <FileText className="size-3.5" /> {item.kind === "ksp" ? "Готов КСП" : "Готов КТП"}
              </p>
              <p className="mt-1 text-[12px] leading-snug text-foreground">{item.title}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-primary-hover">
                  <ExternalLink className="size-3" /> Открыть
                </a>
                {item.docxUrl && (
                  <a href={item.docxUrl} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] text-foreground hover:bg-muted">
                    <Download className="size-3" /> Word
                  </a>
                )}
                {item.pptxUrl && (
                  <a href={item.pptxUrl} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] text-foreground hover:bg-muted">
                    <Presentation className="size-3" /> PowerPoint
                  </a>
                )}
              </div>
              {item.workspaceFile && <p className="mt-1.5 text-[10px] text-muted-foreground">Копия в файлах рабочей области: {item.workspaceFile}</p>}
            </div>
          ))}
        </section>
      )}
      {taskFiles.length > 0 && (
        <section aria-label="Файлы задачи" className="mx-3 mt-3 shrink-0">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Файлы задачи</p>
          <div className="flex flex-wrap gap-1.5">
            {taskFiles.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => openInEditor(name)}
                title={`Открыть «${name}» в редакторе`}
                className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border bg-muted px-2 py-1 font-mono text-[11px] text-foreground hover:bg-muted"
              >
                <FileText className="size-3 shrink-0 text-primary" /> <span className="truncate">{name}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {plan && plan.length > 0 && (
        <div className="mx-3 mt-3 shrink-0 rounded-xl border border-border bg-muted p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              {running ? <Loader2 className="size-3.5 animate-spin" />
                : finishedOk ? <CircleCheck className="size-3.5 text-emerald-700" />
                  : <CircleX className={`size-3.5 ${status === "failed" ? "text-danger" : "text-muted-foreground"}`} />}
              {running ? "Выполняю задачу…"
                : finishedOk ? "Задача выполнена"
                  : status === "failed" || summaryFailed ? "Задача не выполнена" : "Задача остановлена"}
            </p>
            {progress !== null && <span className="text-xs text-muted-foreground">{progress}%</span>}
          </div>
          {progress !== null && (
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          <ul className="space-y-1.5 text-[13px] leading-snug">
            {plan.map((step, idx) => {
              const stepDone = finishedOk || (status !== "stopped" && status !== "failed" && !summaryFailed ? idx < doneSteps : idx < Math.min(doneSteps, plan.length - 1));
              const stepCurrent = running && idx === doneSteps;
              return (
                <li key={idx} className={`flex items-start gap-2 ${stepDone ? "text-muted-foreground" : stepCurrent ? "text-foreground" : "text-muted-foreground"}`}>
                  {stepDone ? <CircleCheck className="mt-0.5 size-3 shrink-0 text-emerald-700" />
                    : stepCurrent ? <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin text-primary" />
                    : <span className="mt-0.5 size-3 shrink-0 rounded-full border border-border" />}
                  <span className="flex-1">{step}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {events.length === 0 && running && (
        <p className="mx-3 mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Агент запускается…
        </p>
      )}
      {/* Паузу и запрос входа учитель должен увидеть сразу, а не внутри подробностей. */}
      {events.filter((e) => e.type === "PAUSED").slice(-1).map((ev, i) => (
        <div key={i} className="mx-3 mt-3 shrink-0"><EventLine ev={ev} previewIndex={i} /></div>
      ))}
      <details className="mx-3 mb-3 mt-3 min-h-0 rounded-xl border border-border bg-surface text-xs">
        <summary className="cursor-pointer px-3 py-2 font-semibold text-muted-foreground">Подробности работы</summary>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="max-h-[420px] space-y-2 overflow-y-auto px-3 pb-3 text-[12px] leading-relaxed"
      >
        {events.filter((e) => e.type !== "META").map((ev, i) => (
          <EventLine key={i} ev={ev} previewIndex={i} />
        ))}
        {status === "completed" && (
          <p className="flex items-center gap-1.5 pt-1 text-emerald-700"><CircleCheck className="size-3.5" /> Задача завершена</p>
        )}
        {status === "failed" && (
          <p className="flex items-center gap-1.5 pt-1 text-danger"><CircleX className="size-3.5" /> Задача завершилась с ошибкой</p>
        )}
        {status === "stopped" && (
          <p className="flex items-center gap-1.5 pt-1 text-muted-foreground"><CircleX className="size-3.5" /> Задача остановлена</p>
        )}
      </div>
      </details>
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
    return <p className="whitespace-pre-wrap text-muted-foreground">{ev.message}</p>;
  }
  if (ev.type === "PAUSED") {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 font-sans text-xs text-amber-800">
        <div className="flex items-start gap-2">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-amber-800" />
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-snug">{ev.message}</p>
            <button
              type="button"
              onClick={() => setTab("browser")}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-50"
            >
              <Globe className="size-3" /> Открыть экран на рабочем месте →
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (ev.type === "TOOL_CALL") {
    if (tool === "executeCommand" || tool === "runCommand") {
      return (
        <p className="rounded bg-muted px-2 py-1 text-emerald-700">
          <span className="text-emerald-500">$</span> {ev.message.replace(/^\$ /, "")}
        </p>
      );
    }
    if (tool === "browserNavigate") {
      return <p className="flex items-start gap-1.5 text-primary"><Globe className="mt-0.5 size-3.5 shrink-0" /> {ev.message}</p>;
    }
    if (tool === "writeFile" || tool === "readFile" || tool === "listFiles") {
      return <p className="flex items-start gap-1.5 text-amber-800"><FileText className="mt-0.5 size-3.5 shrink-0" /> {ev.message}</p>;
    }
    return <p className="text-muted-foreground">{ev.message}</p>;
  }
  if (ev.type === "TOOL_RESULT") {
    const out = extractResult(ev);
    const browserInfo = extractBrowserMeta(ev);
    if (!out && !browserInfo) return null;
    return (
      <div className="space-y-1.5">
        {out && (
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-muted px-2 py-1 text-muted-foreground">
            {out}
          </pre>
        )}
        {browserInfo && (
          <div className="overflow-hidden rounded-xl border border-border bg-surface font-sans">
            <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5 text-[11px]">
              <span className="flex min-w-0 items-center gap-1.5 truncate text-muted-foreground">
                <Globe className="size-3 shrink-0 text-violet-400" />
                <span className="truncate">{browserInfo.title || browserInfo.url}</span>
              </span>
              <button
                type="button"
                onClick={() => setTab("browser")}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary-soft"
              >
                На рабочем месте <ExternalLink className="size-2.5" />
              </button>
            </div>
            {browserInfo.authBarrier?.requiresUserAction && (
              <div className="flex items-center gap-1.5 border-b border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                <Lock className="size-3 shrink-0 text-amber-800" />
                <span>
                  {browserInfo.authBarrier.reason || "Для входа кликните по полю логина/пароля прямо на экране справа."}
                </span>
                {browserInfo.authBarrier.kind === "login" && (
                  <button
                    type="button"
                    onClick={() => setTab("browser")}
                    className="ml-auto shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-50"
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
              className="block w-full bg-muted text-left"
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
    return <p className="whitespace-pre-wrap rounded bg-primary/10 px-2 py-1 text-emerald-700">✓ {ev.message}</p>;
  }
  if (ev.type === "ERROR") {
    return <p className="whitespace-pre-wrap rounded bg-danger-soft px-2 py-1 text-danger">✗ {ev.message}</p>;
  }
  if (ev.type === "WARNING") {
    return <p className="whitespace-pre-wrap rounded bg-amber-50 px-2 py-1 text-amber-800">⚠ {ev.message}</p>;
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
  const color = status === "running" ? "bg-amber-400 animate-pulse" : status === "queued" ? "bg-violet-400" : status === "completed" ? "bg-emerald-400" : status === "failed" ? "bg-red-400" : "bg-slate-400";
  return <span className={`inline-block size-2 rounded-full ${color}`} aria-hidden />;
}

