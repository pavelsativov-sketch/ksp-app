"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TaskPlayer } from "@/components/ksp/task-player";
import type { SessionTaskSnapshot } from "@/lib/types/session";
import type { TaskAnswer, TaskResult } from "@/lib/ksp/tasks";

interface Props {
  sessionId: string;
  code: string;
  tasks: SessionTaskSnapshot[];
}

interface RecordedResult {
  index: number;
  result: TaskResult;
}

const NAME_KEY = "ksp.session.studentName";

export function StudentSessionPlayer({ sessionId, code, tasks }: Props) {
  const [studentName, setStudentName] = useState("");
  const [confirmedName, setConfirmedName] = useState<string | null>(null);
  const [taskIdx, setTaskIdx] = useState(0);
  const [results, setResults] = useState<RecordedResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Restore name from localStorage so a refresh doesn't kick the student out.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(NAME_KEY);
    if (!stored) return;
    const h = setTimeout(() => setStudentName(stored), 0);
    return () => clearTimeout(h);
  }, []);

  const totals = useMemo(() => {
    const score = results.reduce((s, r) => s + r.result.score, 0);
    const max = tasks.reduce((s, t) => s + Math.max(1, t.task.points || 1), 0);
    const correct = results.filter((r) => r.result.isCorrect).length;
    return { score, max, correct };
  }, [results, tasks]);

  function startSession(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = studentName.trim();
    if (!trimmed) return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(NAME_KEY, trimmed);
    }
    setConfirmedName(trimmed);
  }

  async function submitAnswer(answer: TaskAnswer): Promise<TaskResult | null> {
    if (!confirmedName) return null;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/sessions/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          studentName: confirmedName,
          taskIndex: tasks[taskIdx].index,
          answer,
        }),
      });
      const json = (await res.json()) as
        | { result: TaskResult }
        | { error: string };
      if (!res.ok || "error" in json) {
        const msg = "error" in json ? json.error : "Не удалось отправить ответ";
        setSubmitError(msg);
        return null;
      }
      return json.result;
    } catch {
      setSubmitError("Нет связи. Попробуйте ещё раз.");
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-3">
        <h1 className="text-xl font-bold">В этой сессии нет заданий</h1>
        <p className="text-slate-500 text-sm">
          Учитель не добавил интерактивных заданий в план. Возвращайтесь позже.
        </p>
      </div>
    );
  }

  if (!confirmedName) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold">
            Сессия{" "}
            <span className="font-mono text-blue-600">{code}</span>
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {tasks.length}{" "}
            {tasks.length === 1
              ? "задание"
              : tasks.length < 5
                ? "задания"
                : "заданий"}{" "}
            · введите своё имя, чтобы учитель видел ваш прогресс.
          </p>
        </div>
        <form onSubmit={startSession} className="space-y-3">
          <div>
            <Label htmlFor="student-name">Как вас зовут?</Label>
            <Input
              id="student-name"
              autoFocus
              maxLength={80}
              placeholder="Имя Фамилия"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={!studentName.trim()}
          >
            Начать
          </Button>
        </form>
      </div>
    );
  }

  // Finished — show summary.
  if (taskIdx >= tasks.length) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="text-center space-y-2">
          <Trophy className="mx-auto w-12 h-12 text-amber-500" />
          <h1 className="text-2xl font-bold">Готово!</h1>
          <p className="text-slate-600">
            {confirmedName}, вы ответили на все задания.
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 grid grid-cols-3 text-center">
          <div>
            <div className="text-slate-500 text-xs uppercase">Баллы</div>
            <div className="text-xl font-bold">
              {totals.score} / {totals.max}
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-xs uppercase">Верно</div>
            <div className="text-xl font-bold">
              {totals.correct} / {tasks.length}
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-xs uppercase">Точность</div>
            <div className="text-xl font-bold">
              {tasks.length > 0
                ? Math.round((totals.correct / tasks.length) * 100)
                : 0}
              %
            </div>
          </div>
        </div>
        <p className="text-slate-500 text-xs text-center">
          Учитель видит ваш результат в реальном времени.
        </p>
      </div>
    );
  }

  const current = tasks[taskIdx];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">
          {confirmedName} · код{" "}
          <span className="font-mono font-semibold">{code}</span>
        </span>
        <span className="text-slate-500">
          {taskIdx + 1} / {tasks.length}
        </span>
      </div>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all"
          style={{ width: `${((taskIdx + 1) / tasks.length) * 100}%` }}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3">
        <p className="text-xs text-slate-500 uppercase tracking-wider">
          {current.stageLabel}
        </p>

        <StudentTaskWrapper
          task={current}
          onSubmitAnswer={submitAnswer}
          submitting={submitting}
          submitError={submitError}
          onAdvance={(result) => {
            setResults((prev) => [
              ...prev,
              { index: current.index, result },
            ]);
            setTaskIdx((i) => i + 1);
          }}
        />
      </div>

      {taskIdx > 0 && results.length > 0 && (
        <button
          type="button"
          onClick={() => setTaskIdx((i) => Math.max(0, i - 1))}
          className="text-xs text-slate-400 hover:text-slate-600 inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-3 h-3" /> Предыдущий вопрос (без сохранения)
        </button>
      )}
    </div>
  );
}

interface WrapperProps {
  task: SessionTaskSnapshot;
  onSubmitAnswer: (answer: TaskAnswer) => Promise<TaskResult | null>;
  onAdvance: (result: TaskResult) => void;
  submitting: boolean;
  submitError: string | null;
}

/**
 * Bridges TaskPlayer (which evaluates locally and calls onComplete) with
 * the server-side grader. We fire-and-forget the server call when the
 * student submits, so the immediate feedback feels snappy; the server
 * grade is what the teacher sees.
 */
function StudentTaskWrapper({
  task,
  onSubmitAnswer,
  onAdvance,
  submitting,
  submitError,
}: WrapperProps) {
  const [done, setDone] = useState<TaskResult | null>(null);

  return (
    <div className="space-y-3">
      <TaskPlayer
        task={task.task}
        hideReset
        onComplete={async (clientResult, _hints, answer) => {
          // Server is authoritative — re-grade against the snapshot —
          // and the resulting row is what the teacher sees in the live
          // board. We still show the locally-computed feedback first
          // for snappy UX.
          const serverResult = await onSubmitAnswer(answer);
          setDone(serverResult ?? clientResult);
        }}
      />

      {submitError && (
        <div className="rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-sm px-3 py-2">
          {submitError}
        </div>
      )}

      {done && (
        <Button
          className="w-full"
          onClick={() => onAdvance(done)}
          disabled={submitting}
        >
          <CheckCircle2 /> Дальше
        </Button>
      )}
    </div>
  );
}
