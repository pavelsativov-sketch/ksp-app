"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, CircleCheck, CircleX } from "lucide-react";

export interface AgentEvent {
  type: string;
  message: string;
  data?: { tool?: string; args?: Record<string, unknown>; result?: string } | null;
  createdAt?: string | null;
}

type Status = "connecting" | "running" | "completed" | "failed" | "stopped";

/**
 * Живой лог сессии агента: подписка на SSE-поток /api/agents/task/[id],
 * события рендерятся по мере появления (реальное время).
 */
export type AgentStatus = Status;

export function AgentSession({ taskId, variant = "compact", onStatus }: {
  taskId: string;
  /** compact — тёмный лог внутри ОС; chat — тот же поток в чатовой панели. */
  variant?: "compact" | "chat";
  onStatus?: (s: AgentStatus) => void;
}) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<Status>("connecting");
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  

  useEffect(() => {
    // The panel is reused for the next task; remove the previous task's log.
    setEvents([]);
    setStatus("connecting");
    const es = new EventSource(`/api/agents/task/${taskId}`);
    let final = false;

    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as AgentEvent & { status?: string };
        if (ev.type === "STATUS_UPDATE") {
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
      setStatus((prev) => (prev === "running" ? "running" : "connecting"));
    };
    es.onopen = () => setStatus("running");

    return () => es.close();
  }, [taskId]);

  // Наружу статус отдаём отдельным эффектом на верхнем уровне компонента:
  // хук внутри колбэка другого эффекта — «Invalid hook call».
  useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  // автоскролл вниз, пока пользователь не отмотал вверх
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  // План из META: чеклист шагов, отмечаются по мере выполнения инструментов.
  const metaEv = events.find((e) => e.type === "META") as unknown as (AgentEvent & { plan?: string[] }) | undefined;
  const plan = metaEv?.plan ?? (metaEv?.data as unknown as { plan?: string[] } | undefined)?.plan ?? null;
  const doneSteps = events.filter((e) => e.type === "TOOL_RESULT").length;
  const progress = plan && plan.length
    ? status === "completed" ? 100 : Math.min(100, Math.round((doneSteps / plan.length) * 100))
    : null;
  const running = status === "running" || status === "connecting";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* План-чеклист + прогресс (как карточка задачи в чате) */}
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
              const stepDone = status === "completed" || idx < doneSteps;
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
          <EventLine key={i} ev={ev} />
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

function EventLine({ ev }: { ev: AgentEvent }) {
  const tool = ev.data?.tool;
  if (ev.type === "THINK") {
    return <p className="text-muted-foreground/70 italic">· {ev.message}</p>;
  }
  if (ev.type === "REASONING") {
    return <p className="whitespace-pre-wrap text-slate-400">{ev.message}</p>;
  }
  if (ev.type === "TOOL_CALL") {
    if (tool === "executeCommand") {
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
    if (!out) return null;
    return <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-black/30 px-2 py-1 text-slate-300">{out}</pre>;
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
  const color = status === "running" || status === "connecting" ? "bg-amber-400 animate-pulse" : status === "completed" ? "bg-emerald-400" : status === "failed" ? "bg-red-400" : "bg-slate-400";
  return <span className={`inline-block size-2 rounded-full ${color}`} aria-hidden />;
}
