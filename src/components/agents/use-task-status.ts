"use client";

import { useEffect, useState } from "react";
import { fetchTasksShared, useActiveAgentTask } from "./agent-dock";

export type ActiveTaskStatus = "idle" | "queued" | "running" | "completed" | "failed" | "stopped";

const API_STATUS: Record<string, ActiveTaskStatus> = {
  queued: "queued",
  running: "running",
  completed: "completed",
  failed: "failed",
  stopped: "stopped",
};

function normalize(raw: string | undefined): ActiveTaskStatus {
  return (raw && API_STATUS[raw]) || "running";
}

function isTerminalStatus(s: ActiveTaskStatus): boolean {
  return s === "completed" || s === "failed" || s === "stopped" || s === "idle";
}

function formatHms(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Статус активной задачи агента для статус-бара и кнопок «Запустить» /
 * «Остановить»: опрашивает список задач пользователя, пока задача жива,
 * и сразу прекращает опрос при терминальном статусе.
 */
export function useActiveTaskStatus(): {
  status: ActiveTaskStatus;
  elapsed: string | null;
  startedAt: number | null;
} {
  const task = useActiveAgentTask();
  const [status, setStatus] = useState<ActiveTaskStatus>("running");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!task) return;
    let alive = true;
    let inFlight = false;
    let poll: ReturnType<typeof setInterval> | undefined;

    const read = async () => {
      if (inFlight) return;
      if (typeof document !== "undefined" && document.hidden) return;
      inFlight = true;
      try {
        const data = await fetchTasksShared(1500);
        const found = data?.tasks?.find((t) => t.id === task.id);
        if (!alive || !found) return;
        const nextStatus = normalize(found.status);
        setStatus(nextStatus);
        setStartedAt(new Date(found.createdAt).getTime());
        setNow(Date.now());
        if (isTerminalStatus(nextStatus) && poll) {
          clearInterval(poll);
          poll = undefined;
        }
      } catch {
        // статус не критичен: оставляем предыдущее значение
      } finally {
        inFlight = false;
      }
    };

    void read();
    poll = setInterval(() => void read(), 3000);
    return () => {
      alive = false;
      if (poll) clearInterval(poll);
    };
  }, [task]);

  useEffect(() => {
    if (!task || status !== "running") return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [task, status]);

  const elapsed = task && startedAt && now !== null ? formatHms(Math.max(0, Math.floor((now - startedAt) / 1000))) : null;

  return { status: task ? status : "idle", elapsed, startedAt };
}
