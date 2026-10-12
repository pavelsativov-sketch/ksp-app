"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleCheck, CircleX, Loader2 } from "lucide-react";
import { setActiveAgentTask } from "@/components/agents/agent-dock";
import { Button } from "@/components/ui/button";

interface TaskRow {
  id: string;
  title: string;
  status: string;
  result: string | null;
  error: string | null;
  createdAt: string;
}

/** История задач агента: клик по задаче снова открывает живое окно сессии. */
export default function AgentHistoryPage() {
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/agents/task")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { tasks: TaskRow[] }) => { if (alive) setTasks(data.tasks ?? []); })
      .catch((e: Error) => {
        if (e.message === "401") { window.location.href = "/login?next=/school/agents"; return; }
        if (alive) setError("Не удалось загрузить задачи");
      });
    return () => { alive = false; };
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="editorial-kicker">Рабочая область</p>
          <h1 className="editorial-display mt-2 text-3xl">История задач агента</h1>
        </div>
        <Link href="/school" className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          + Новая задача
        </Link>
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {tasks === null && !error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Загрузка…</p>
      )}

      {tasks?.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Задач пока нет. <Link href="/school" className="editorial-link font-semibold">Дайте первую задачу</Link>.
        </p>
      )}

      <ul className="space-y-2">
        {tasks?.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{t.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {new Date(t.createdAt).toLocaleString("ru-RU")}
                {t.status === "completed" && t.result ? ` — ${t.result.slice(0, 80)}` : ""}
                {t.status === "failed" && t.error ? ` — ${t.error.slice(0, 80)}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {t.status === "running" && <Loader2 className="size-4 animate-spin text-amber-500" aria-label="выполняется" />}
              {t.status === "completed" && <CircleCheck className="size-4 text-emerald-500" aria-label="готово" />}
              {t.status === "failed" && <CircleX className="size-4 text-red-500" aria-label="ошибка" />}
              <Button variant="outline" size="sm" onClick={() => setActiveAgentTask(t.id, t.title)}>
                Открыть сессию
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <Link href="/school" className="text-sm text-muted-foreground hover:text-foreground">← К рабочей области</Link>
      </div>
    </main>
  );
}
