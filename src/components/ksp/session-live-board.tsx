"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { closeSessionAction } from "@/app/actions/sessions";
import type {
  LessonSessionRow,
  SessionResponseRow,
} from "@/lib/types/session";

interface Props {
  session: LessonSessionRow;
  initialResponses: SessionResponseRow[];
}

export function SessionLiveBoard({ session, initialResponses }: Props) {
  const [responses, setResponses] = useState(initialResponses);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [status, setStatus] = useState(session.status);

  // Poll every 3s for new responses while session is active.
  useEffect(() => {
    if (status !== "active") return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/sessions/${session.id}/responses`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { responses: SessionResponseRow[] };
        if (!cancelled) setResponses(data.responses ?? []);
      } catch {
        /* network blips are fine, will retry next tick */
      }
    }
    const h = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(h);
    };
  }, [session.id, status]);

  async function manualRefresh() {
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/responses`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { responses: SessionResponseRow[] };
        setResponses(data.responses ?? []);
      }
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (!confirm("Закрыть сессию? Ученики больше не смогут отвечать.")) return;
    setClosing(true);
    const res = await closeSessionAction(session.id);
    setClosing(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    setStatus("closed");
  }

  // Aggregate per student: total score / max possible / tasks completed.
  const summary = useMemo(() => {
    const maxPerTask = new Map<number, number>();
    for (const t of session.tasks_snapshot) {
      maxPerTask.set(t.index, Math.max(1, t.task.points || 1));
    }
    const maxPossible = Array.from(maxPerTask.values()).reduce(
      (s, n) => s + n,
      0,
    );

    const byStudent = new Map<
      string,
      {
        name: string;
        completed: Set<number>;
        score: number;
        correct: number;
        total: number;
        last: string;
      }
    >();
    for (const r of responses) {
      let row = byStudent.get(r.student_name);
      if (!row) {
        row = {
          name: r.student_name,
          completed: new Set(),
          score: 0,
          correct: 0,
          total: 0,
          last: r.created_at,
        };
        byStudent.set(r.student_name, row);
      }
      // Each student–task pair: count only the latest answer.
      // We've sorted by created_at ascending, so override is correct.
      const key = r.task_index;
      if (row.completed.has(key)) {
        // Already counted previous answer; subtract & re-add.
        // Cheap approach: rebuild fully — fine for typical class size <50.
      }
      row.completed.add(key);
      row.last = r.created_at;
    }

    // Re-aggregate from scratch with "last answer per task wins".
    const lastPerStudent = new Map<string, Map<number, SessionResponseRow>>();
    for (const r of responses) {
      let m = lastPerStudent.get(r.student_name);
      if (!m) {
        m = new Map();
        lastPerStudent.set(r.student_name, m);
      }
      m.set(r.task_index, r);
    }

    const rows = Array.from(lastPerStudent.entries()).map(([name, m]) => {
      let score = 0;
      let correct = 0;
      let last = "";
      for (const r of m.values()) {
        score += r.score;
        if (r.is_correct) correct += 1;
        if (r.created_at > last) last = r.created_at;
      }
      return {
        name,
        completed: m.size,
        score,
        correct,
        total: m.size,
        last,
      };
    });
    rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    // Per-task accuracy.
    const perTask = session.tasks_snapshot.map((t) => {
      const all = responses.filter((r) => r.task_index === t.index);
      const correct = all.filter((r) => r.is_correct).length;
      return {
        index: t.index,
        question: t.task.question,
        stage: t.stageLabel,
        attempts: all.length,
        correct,
      };
    });

    return { rows, perTask, maxPossible };
  }, [responses, session.tasks_snapshot]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xl font-bold tracking-widest bg-slate-100 border border-slate-200 px-3 py-1 rounded">
          {session.code}
        </span>
        <span
          className={
            "text-xs font-semibold uppercase px-2 py-0.5 rounded border " +
            (status === "active"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-slate-100 text-slate-600 border-slate-300")
          }
        >
          {status === "active" ? "Активна" : "Закрыта"}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={manualRefresh} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw />}{" "}
            Обновить
          </Button>
          {status === "active" && (
            <Button variant="outline" size="sm" onClick={close} disabled={closing}>
              <X /> Закрыть сессию
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold">Ученики ({summary.rows.length})</h2>
          <p className="text-xs text-slate-500">
            Макс. баллов: {summary.maxPossible}
          </p>
        </div>
        {summary.rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-slate-500 text-sm">
            Пока никто не ответил. Сообщите ученикам код{" "}
            <span className="font-mono font-bold">{session.code}</span>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Имя</th>
                  <th className="text-right px-4 py-2 font-medium">
                    Заданий
                  </th>
                  <th className="text-right px-4 py-2 font-medium">Верно</th>
                  <th className="text-right px-4 py-2 font-medium">
                    Баллов
                  </th>
                  <th className="text-right px-4 py-2 font-medium">
                    Последний ответ
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((r) => (
                  <tr key={r.name} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2 text-right">
                      {r.completed} / {session.tasks_snapshot.length}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.correct} / {r.total}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      {r.score} / {summary.maxPossible}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-slate-500">
                      {new Date(r.last).toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="px-4 py-2 border-b border-slate-200">
          <h2 className="font-semibold">По заданиям</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium w-12">№</th>
                <th className="text-left px-4 py-2 font-medium">Этап</th>
                <th className="text-left px-4 py-2 font-medium">Вопрос</th>
                <th className="text-right px-4 py-2 font-medium">Ответили</th>
                <th className="text-right px-4 py-2 font-medium">% верных</th>
              </tr>
            </thead>
            <tbody>
              {summary.perTask.map((t) => {
                const pct =
                  t.attempts > 0 ? Math.round((t.correct / t.attempts) * 100) : 0;
                return (
                  <tr key={t.index} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-2 font-mono text-slate-500">
                      {t.index + 1}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{t.stage}</td>
                    <td className="px-4 py-2">
                      <div className="line-clamp-2">{t.question}</div>
                    </td>
                    <td className="px-4 py-2 text-right">{t.attempts}</td>
                    <td className="px-4 py-2 text-right">
                      <span
                        className={
                          pct >= 70
                            ? "text-emerald-700 font-semibold"
                            : pct >= 40
                              ? "text-amber-700 font-semibold"
                              : "text-rose-700 font-semibold"
                        }
                      >
                        {t.attempts === 0 ? "—" : `${pct}%`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
