"use client";

import { useEffect, useState } from "react";
import { useActiveAgentTask } from "./agent-dock";

export type ActiveTaskStatus = "idle" | "running" | "completed" | "failed" | "stopped";

const API_STATUS: Record<string, ActiveTaskStatus> = {
  running: "running",
  completed: "completed",
  failed: "failed",
  stopped: "stopped",
};

function normalize(raw: string | undefined): ActiveTaskStatus {
  return (raw && API_STATUS[raw]) || "running";
}

function formatHms(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Статус активной задачи агента для статус-бара и кнопок «Запустить» /
 * «Остановить»: опрашивает список задач пользователя, пока задача жива.
 *
 * Внутри чата тот же статус приходит по SSE (AgentSession) — здесь нужен
 * независимый источник для элементов вне чата.
 */
export function useActiveTaskStatus(): {
  status: ActiveTaskStatus;
  elapsed: string | null;
  startedAt: number | null;
} {
  const task = useActiveAgentTask();
  const [status, setStatus] = useState<ActiveTaskStatus>("running");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!task) return;
    let alive = true;

    const read = async () => {
      try {
        const res = await fetch("/api/agents/task", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { tasks?: { id: string; status: string; createdAt: string }[] };
        const found = data.tasks?.find((t) => t.id === task.id);
        if (!alive || !found) return;
        setStatus(normalize(found.status));
        setStartedAt(new Date(found.createdAt).getTime());
      } catch {
        // статус не критичен: оставляем предыдущее значение
      }
    };

    void read();
    const poll = setInterval(() => void read(), 3000);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, [task]);

  useEffect(() => {
    if (!task || status !== "running") return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [task, status]);

  const elapsed = task && startedAt ? formatHms(Math.max(0, Math.floor((now - startedAt) / 1000))) : null;

  return { status: task ? status : "idle", elapsed, startedAt };
}
