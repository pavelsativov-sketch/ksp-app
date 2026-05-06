"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LessonPlanRow, KspContent } from "@/lib/types/ksp";
import { Button } from "@/components/ui/button";
import { Pencil, Save, X, Loader2, CheckCircle2 } from "lucide-react";
import { PlanView } from "./plan-view";
import { InlineEditProvider } from "./inline-edit-context";
import { autosavePlanAction } from "@/app/actions/plans";

/**
 * Wraps PlanView with an "inline edit" mode for the owner.
 *
 * - "Редактировать на месте" toggles edit mode; PlanView renders inputs
 *   instead of plain text via the InlineEditContext.
 * - Edits accumulate in a local draft (no autosave — explicit save).
 * - "Сохранить" persists the whole content via `autosavePlanAction` (no
 *   schema validation, accepts arbitrary content shape — same path used
 *   by the full-form autosave).
 * - "Отменить" rolls back the draft to the original content.
 */
export function PlanInlineEditWrapper({ plan }: { plan: LessonPlanRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<KspContent>(plan.content);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  const update = useCallback(
    (mutator: (draft: KspContent) => void) => {
      setDraft((prev) => {
        const next: KspContent =
          typeof structuredClone === "function"
            ? structuredClone(prev)
            : (JSON.parse(JSON.stringify(prev)) as KspContent);
        mutator(next);
        return next;
      });
      setDirty(true);
      setSavedAt(null);
    },
    [],
  );

  const cancel = () => {
    if (
      dirty &&
      !confirm(
        "У вас есть несохранённые правки. Отменить и вернуть исходный текст?",
      )
    ) {
      return;
    }
    setDraft(plan.content);
    setDirty(false);
    setError(null);
    setEditing(false);
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await autosavePlanAction({
        id: plan.id,
        title: plan.title,
        content: draft,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setDirty(false);
      setSavedAt(Date.now());
      router.refresh();
    });
  };

  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        {!editing ? (
          <>
            <span className="text-sm text-amber-900">
              Редактирование на месте — правьте любой текст прямо в плане.
            </span>
            <div className="ml-auto">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
              >
                <Pencil className="w-4 h-4" /> Редактировать на месте
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="text-sm text-amber-900 inline-flex items-center gap-2">
              <Pencil className="w-4 h-4" /> Режим редактирования на месте
              {dirty && (
                <span className="text-amber-700">· есть несохранённые правки</span>
              )}
              {!dirty && savedAt && (
                <span className="text-emerald-700 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  Сохранено {new Date(savedAt).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={cancel}
                disabled={pending}
              >
                <X className="w-4 h-4" /> Отменить
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={save}
                disabled={pending || !dirty}
              >
                {pending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}{" "}
                Сохранить
              </Button>
            </div>
          </>
        )}
      </div>
      {error && (
        <div className="no-print mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Не удалось сохранить: {error}
        </div>
      )}

      <InlineEditProvider enabled={editing} draft={draft} update={update}>
        <PlanView plan={plan} />
      </InlineEditProvider>
    </div>
  );
}
