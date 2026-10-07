"use client";

import { useEffect, useState } from "react";
import { Sparkles, X, Check } from "lucide-react";
import type { AiProgress } from "./hooks/use-plan-ai";

/**
 * Окно ожидания генерации КСП.
 *
 * Раньше здесь стоял таймер: проценты доходили до 100% за 20 секунд и
 * показывали «готово», хотя модель ещё писала. Учитель успевал решить, что
 * всё сломалось, и нажать «Отменить». Теперь цифры приходят с сервера и
 * означают настоящий этап работы.
 */

interface AiLoadingOverlayProps {
  progress: AiProgress | null;
  onCancel: () => void;
}

/** Что показано в журнале этапов: пройденные отметки остаются видимыми. */
const STAGE_NOTES: Array<{ atLeast: number; note: string }> = [
  { atLeast: 10, note: "Тема и цели урока разобраны" },
  { atLeast: 55, note: "Черновик получен" },
  { atLeast: 100, note: "План готов — проверяйте и правьте" },
];

export function AiLoadingOverlay({ progress, onCancel }: AiLoadingOverlayProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const percent = Math.max(0, Math.min(100, progress?.percent ?? 0));
  const done = percent >= 100;
  // Этапы копятся: учитель видит не только текущий, но и пройденные.
  const passed = STAGE_NOTES.filter((s) => percent >= s.atLeast);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-popover">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className={`size-5 ${done ? "text-emerald-500" : "animate-pulse text-primary"}`} />
            <span className="font-semibold">{done ? "План готов" : "AI заполняет план"}</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Отменить генерацию"
            aria-label="Отменить генерацию"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Полоса прогресса с настоящим процентом. */}
        <div className="mb-2 h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all duration-700 ease-out ${
              done ? "bg-emerald-500" : "bg-primary"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mb-4 flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">{progress?.label ?? "Подключаемся к модели"}</span>
          <span className="font-semibold tabular-nums text-foreground">{percent}%</span>
        </div>

        <ul className="mb-4 space-y-1.5">
          {passed.length === 0 && (
            <li className="text-sm text-muted-foreground">Начинаем работу…</li>
          )}
          {passed.map((s) => (
            <li key={s.atLeast} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span
                className={`flex size-5 items-center justify-center rounded-full text-[10px] ${
                  done ? "bg-emerald-500 text-white" : "bg-primary text-white"
                }`}
              >
                <Check className="size-3" />
              </span>
              {s.note}
            </li>
          ))}
        </ul>

        {/* Реальное время, а не придуманная оценка: раньше здесь стояло
            «примерно осталось 40 сек», чего сервер не знает. */}
        <p className="mb-4 text-center text-xs text-muted-foreground">
          Прошло {elapsed} с. Если очень долго — можно отменить и написать план вручную:
          поля формы остаются доступными.
        </p>

        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-lg border border-border py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Отменить генерацию
        </button>
      </div>
    </div>
  );
}
