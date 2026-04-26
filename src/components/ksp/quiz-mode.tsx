"use client";

import { useState, useMemo } from "react";
import { Trophy, Sparkles, X, ArrowRight, RotateCcw } from "lucide-react";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { TaskPlayer } from "./task-player";
import type { InteractiveTask, TaskResult } from "@/lib/ksp/tasks";

interface StageBundle {
  stageKey: "beginning" | "middle" | "end";
  stageTitle: string;
  tasks: InteractiveTask[];
}

export interface QuizModeProps {
  stages: StageBundle[];
  onClose: () => void;
}

export function QuizMode({ stages, onClose }: QuizModeProps) {
  const flat = useMemo(
    () =>
      stages.flatMap((s) =>
        s.tasks.map((t) => ({ stageTitle: s.stageTitle, task: t })),
      ),
    [stages],
  );

  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<Array<TaskResult & { stageTitle: string; question: string }>>(
    [],
  );
  const [locked, setLocked] = useState(false);

  const totalMax = flat.reduce((a, x) => a + Math.max(1, x.task.points), 0);
  const totalScored = results.reduce((a, r) => a + r.score, 0);
  const progress = flat.length === 0 ? 100 : Math.round((idx / flat.length) * 100);
  const finished = idx >= flat.length;

  function handleComplete(result: TaskResult) {
    if (locked) return;
    setLocked(true);
    const item = flat[idx];
    setResults((prev) => [
      ...prev,
      { ...result, stageTitle: item.stageTitle, question: item.task.question },
    ]);
  }

  function next() {
    setLocked(false);
    setIdx((i) => i + 1);
  }

  function restart() {
    setIdx(0);
    setResults([]);
    setLocked(false);
  }

  if (flat.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4">
          <h3 className="text-lg font-semibold">Нет заданий</h3>
          <p className="text-sm text-slate-600">
            В этом КСП пока нет интерактивных заданий. Добавьте их в редакторе, чтобы пройти урок как квиз.
          </p>
          <Button onClick={onClose}>Закрыть</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-stretch md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-2xl md:rounded-xl shadow-xl flex flex-col max-h-full">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Режим квиза</p>
            <p className="text-xs text-slate-500">
              {finished
                ? `Готово — ${results.length} из ${flat.length}`
                : `Задание ${idx + 1} из ${flat.length} · ${flat[idx].stageTitle}`}
            </p>
          </div>
          <div className="text-sm font-mono text-slate-700">
            {totalScored} / {totalMax}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 md:p-6">
          {finished ? (
            <FinalScreen
              total={totalScored}
              max={totalMax}
              results={results}
              onRestart={restart}
              onClose={onClose}
            />
          ) : (
            <div className="space-y-4">
              <TaskPlayer
                key={flat[idx].task.id}
                task={flat[idx].task}
                onComplete={handleComplete}
                hideReset
              />
              {locked && (
                <div className="flex justify-end">
                  <Button onClick={next}>
                    {idx === flat.length - 1 ? "К итогам" : "Далее"}{" "}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FinalScreen({
  total,
  max,
  results,
  onRestart,
  onClose,
}: {
  total: number;
  max: number;
  results: Array<TaskResult & { stageTitle: string; question: string }>;
  onRestart: () => void;
  onClose: () => void;
}) {
  const pct = max === 0 ? 0 : Math.round((total / max) * 100);
  const correctCount = results.filter((r) => r.isCorrect).length;

  // Celebration on high score
  if (pct >= 80 && typeof window !== "undefined") {
    requestAnimationFrame(() => {
      void confetti({
        particleCount: 150,
        spread: 120,
        origin: { y: 0.3 },
        zIndex: 9999,
      });
    });
  }

  const emoji = pct >= 90 ? "🏆" : pct >= 70 ? "🎉" : pct >= 50 ? "👍" : "💪";
  const tier =
    pct >= 90
      ? "Превосходно!"
      : pct >= 70
        ? "Отличный результат"
        : pct >= 50
          ? "Хорошо, есть над чем поработать"
          : "Попробуйте ещё раз";

  return (
    <div className="space-y-4">
      <div className="text-center py-6">
        <div className="text-5xl mb-2">{emoji}</div>
        <Trophy className="w-10 h-10 text-amber-500 mx-auto mb-2" />
        <h3 className="text-2xl font-bold">{total} / {max}</h3>
        <p className="text-slate-600">{tier} · {pct}%</p>
        <p className="text-xs text-slate-500 mt-1">
          Правильно: {correctCount} из {results.length}
        </p>
      </div>

      <div className="border-t border-slate-200 pt-3 space-y-2 text-sm">
        {results.map((r, i) => (
          <div
            key={i}
            className={
              "p-2 rounded border flex items-start gap-2 " +
              (r.isCorrect
                ? "bg-emerald-50 border-emerald-200"
                : "bg-amber-50 border-amber-200")
            }
          >
            <span className="text-xs text-slate-500 w-6">{i + 1}.</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{r.question || "—"}</p>
              <p className="text-xs text-slate-500">{r.stageTitle}</p>
            </div>
            <span className="font-mono text-sm shrink-0">
              {r.score}/{r.maxScore}
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" onClick={onRestart}>
          <RotateCcw className="w-4 h-4" /> Пройти снова
        </Button>
        <Button onClick={onClose}>Закрыть</Button>
      </div>
    </div>
  );
}
