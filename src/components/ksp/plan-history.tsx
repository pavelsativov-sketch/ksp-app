"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listPlanVersionsAction,
  restorePlanVersionAction,
  type PlanVersionRow,
} from "@/app/actions/versions";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function summariseContent(c: PlanVersionRow["content"] | null | undefined): string {
  if (!c) return "—";
  const parts: string[] = [];
  if (c.topic) parts.push(`Тема: «${c.topic}»`);
  if (c.lessonObjectives?.length) parts.push(`${c.lessonObjectives.length} цел${pluralRu(c.lessonObjectives.length)}`);
  const tasks = (c.stages?.beginning?.tasks?.length ?? 0)
    + (c.stages?.middle?.tasks?.length ?? 0)
    + (c.stages?.end?.tasks?.length ?? 0);
  if (tasks) parts.push(`${tasks} задани${pluralRuTask(tasks)}`);
  return parts.join(" · ") || "пустой план";
}

function pluralRu(n: number) {
  // 1 цель, 2-4 цели, 5+ целей
  const last = n % 10;
  const lastTwo = n % 100;
  if (last === 1 && lastTwo !== 11) return "ь";
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "и";
  return "ей";
}

function pluralRuTask(n: number) {
  const last = n % 10;
  const lastTwo = n % 100;
  if (last === 1 && lastTwo !== 11) return "е";
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "я";
  return "й";
}

export function PlanHistoryButton({
  planId,
  isOwner,
}: {
  planId: string;
  isOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<PlanVersionRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, startRestore] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Defer state writes out of the effect body to avoid React's
    // "set-state-in-effect" warning, then load.
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      listPlanVersionsAction(planId)
        .then((rows) => {
          if (!cancelled) setVersions(rows);
        })
        .catch(() => {
          if (!cancelled) setError("Не удалось загрузить историю");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [open, planId]);

  function restore(versionId: string) {
    if (!confirm("Восстановить эту версию? Текущее состояние сохранится в истории как новая запись.")) return;
    setError(null);
    startRestore(async () => {
      const res = await restorePlanVersionAction({ versionId, planId });
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Открыть историю версий плана"
      >
        <History className="w-4 h-4" /> История
      </Button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="plan-history-title"
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start md:items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 id="plan-history-title" className="font-semibold flex items-center gap-2">
                <History className="w-4 h-4" /> История версий
              </h2>
              <button
                type="button"
                aria-label="Закрыть"
                className="text-slate-500 hover:text-slate-800"
                onClick={() => setOpen(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto px-4 py-3 space-y-2 flex-1">
              {loading && (
                <p className="text-sm text-slate-500 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Загружаем…
                </p>
              )}
              {!loading && versions && versions.length === 0 && (
                <p className="text-sm text-slate-500">
                  Версий пока нет. Они появляются автоматически при каждом
                  изменении содержимого плана.
                </p>
              )}
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              {!loading && versions && versions.length > 0 && (
                <ul className="divide-y divide-slate-100">
                  {versions.map((v) => (
                    <li key={v.id} className="py-2 flex items-start justify-between gap-3">
                      <div className="text-sm">
                        <div className="font-medium">
                          {formatDateTime(v.created_at)}
                        </div>
                        <div className="text-slate-600">
                          {v.title}
                        </div>
                        <div className="text-xs text-slate-500">
                          {summariseContent(v.content)}
                        </div>
                      </div>
                      {isOwner && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={restoring}
                          onClick={() => restore(v.id)}
                          aria-label={`Восстановить версию от ${formatDateTime(v.created_at)}`}
                        >
                          {restoring ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5" />
                          )}
                          Восстановить
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500 bg-slate-50">
              Снимок создаётся автоматически при каждом сохранении плана.
              Хранятся до 50 последних версий.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
