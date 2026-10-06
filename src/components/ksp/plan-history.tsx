"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, History, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { restorePlanVersionAction } from "@/app/actions/plans";
import type { PlanVersionRow } from "@/lib/plan-versions";
import { PlanView } from "./plan-view";

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const REASON_LABEL: Record<PlanVersionRow["reason"], string> = {
  save: "Полное сохранение",
  draft: "Черновик",
  restore: "Восстановление",
};

/**
 * Предпросмотр снимка с явным подтверждением: восстановление выполняется
 * только после нажатия кнопки, а не автоматически.
 */
export function PlanHistory({
  planId,
  currentUpdatedAt,
  versions,
}: {
  planId: string;
  currentUpdatedAt: string;
  versions: PlanVersionRow[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<PlanVersionRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function restore(version: PlanVersionRow) {
    setError(null);
    startTransition(async () => {
      try {
      const res = await restorePlanVersionAction({
        plan_id: planId,
        version_id: version.id,
        expected_updated_at: currentUpdatedAt,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setRestoredAt(res.updated_at ?? null);
      setSelected(null);
      router.refresh();
      } catch {
        setError("Не удалось восстановить версию. Попробуйте ещё раз.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-[#dbc7a7] bg-[#f8eedc] p-4 text-sm text-[#745329]">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#9b651f]" />
          <p>{error}</p>
        </div>
      )}
      {restoredAt && !selected && (
        <div className="rounded-2xl border border-[#b9d4c6] bg-[#eef6f1] p-4 text-sm text-[#2f5b4f]">
          Версия восстановлена. Текущая копия плана обновлена, видимость сохранена.
        </div>
      )}
      {versions.length === 0 ? (
        <p className="text-sm text-[#5f5751]">
          Пока нет сохранённых версий. История появляется после первого сохранения или черновика.
        </p>
      ) : (
        <ul className="space-y-3">
          {versions.map((version) => (
            <li key={version.id} className="rounded-2xl border border-[#ddd5cb] bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {formatDate(version.plan.updated_at)} UTC · перед действием «{REASON_LABEL[version.reason]}»
                    {version.is_draft ? " · черновик" : ""}
                  </p>
                  <p className="mt-1 text-sm text-[#5f5751]">
                    Тема: {version.plan.content?.topic || "—"} · {version.plan.title} · {version.plan.grade} класс
                  </p>
                </div>
                <Button variant="outline" type="button" onClick={() => { setSelected(version); setError(null); }}>
                  <History /> Посмотреть
                </Button>
              </div>

              {selected?.id === version.id && (
                <div className="mt-4 space-y-3 rounded-xl border border-[#ddd5cb] bg-[#faf7f2] p-4 text-sm">
                  <p className="font-medium">Предпросмотр версии от {formatDate(version.plan.updated_at)} UTC</p>
                  <ul className="list-disc space-y-1 pl-5 text-[#5f5751]">
                    <li>Название: {version.plan.title}</li>
                    <li>Тема урока: {version.plan.content?.topic || "—"}</li>
                    <li>Класс: {version.plan.grade} · Язык: {version.plan.language === "kz" ? "казахский" : "русский"}</li>
                    <li>Статус в снимке: {version.is_draft ? "черновик" : "сохранённый план"}</li>
                    <li>Целей обучения: {version.plan.content?.learningObjectives?.length ?? 0}</li>
                    <li>Заданий в этапах: {(version.plan.content?.stages?.beginning?.tasks?.length ?? 0) + (version.plan.content?.stages?.middle?.tasks?.length ?? 0) + (version.plan.content?.stages?.end?.tasks?.length ?? 0)}</li>
                  </ul>
                  <details>
                    <summary className="cursor-pointer font-medium">Полное содержимое версии</summary>
                    <div className="mt-3"><PlanView plan={version.plan} /></div>
                  </details>
                  <p className="text-[#745329]">
                    Восстановление заменит текущее содержимое плана этой версией. Текущая видимость (в том числе
                    публикация) останется прежней.
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" disabled={pending} onClick={() => restore(version)}>
                      {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Восстановить
                    </Button>
                    <Button variant="outline" type="button" disabled={pending} onClick={() => setSelected(null)}>
                      Отмена
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
