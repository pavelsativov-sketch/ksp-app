"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, History, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { restorePlanVersionAction } from "@/app/actions/plans";
import type { PlanSection, PlanVersionRow } from "@/lib/plan-versions";
import type { LessonPlanRow } from "@/lib/types/ksp";
import { PlanView } from "./plan-view";

const SECTIONS: PlanSection[] = ["metadata", "objectives", "context", "beginning", "middle", "end", "evaluation"];
const SECTION_LABEL: Record<PlanSection, string> = {
  metadata: "Основные сведения и шапка",
  objectives: "Тема, цели и критерии",
  context: "Ценности и контекст",
  beginning: "Начало урока",
  middle: "Середина урока",
  end: "Завершение урока",
  evaluation: "Оценивание и дифференциация",
};

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const REASON_LABEL: Record<PlanVersionRow["reason"], string> = {
  save: "Полное сохранение",
  draft: "Черновик",
  restore: "Восстановление",
};

type FieldChange = { path: string; kind: "added" | "removed" | "changed" };

function flattenFields(value: unknown, prefix = "", fields = new Map<string, string>()): Map<string, string> {
  if (value === null || value === undefined || value === "") return fields;
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenFields(item, `${prefix}[${index + 1}]`, fields));
  } else if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) =>
      flattenFields(item, prefix ? `${prefix}.${key}` : key, fields),
    );
  } else if (prefix) {
    fields.set(prefix, String(value));
  }
  return fields;
}

function fieldChanges(current: LessonPlanRow, previous: LessonPlanRow, section: PlanSection): FieldChange[] {
  const currentFields = flattenFields(sectionSnapshot(current, section));
  const previousFields = flattenFields(sectionSnapshot(previous, section));
  return [...new Set([...currentFields.keys(), ...previousFields.keys()])].flatMap((path) => {
    const currentValue = currentFields.get(path);
    const previousValue = previousFields.get(path);
    if (currentValue === previousValue) return [];
    return [{ path, kind: previousValue === undefined ? "added" as const : currentValue === undefined ? "removed" as const : "changed" as const }];
  });
}

function sectionSnapshot(plan: LessonPlanRow, section: PlanSection): unknown {
  const content = plan.content;
  switch (section) {
    case "metadata":
      return {
        title: plan.title,
        subject_id: plan.subject_id,
        grade: plan.grade,
        quarter: plan.quarter,
        section: plan.section,
        class_id: plan.class_id,
        language: plan.language,
        schoolProfile: content.schoolProfile,
        header: content.header,
      };
    case "objectives":
      return {
        topic: content.topic,
        learningObjectives: content.learningObjectives,
        lessonObjectives: content.lessonObjectives,
        assessmentCriteria: content.assessmentCriteria,
        languageObjectives: content.languageObjectives,
      };
    case "context":
      return { values: content.values, crossCurricularLinks: content.crossCurricularLinks, priorKnowledge: content.priorKnowledge };
    case "beginning":
    case "middle":
    case "end":
      return content.stages[section];
    case "evaluation":
      return content.evaluation;
  }
}

function compact(parts: Array<string | undefined | null>): string {
  const text = parts.map((part) => part?.trim()).filter(Boolean).join(" · ");
  return text ? `${text.slice(0, 260)}${text.length > 260 ? "…" : ""}` : "—";
}

function sectionPreview(plan: LessonPlanRow, section: PlanSection): string {
  const content = plan.content;
  switch (section) {
    case "metadata": {
      const header = content.header as unknown as Record<string, unknown> | undefined;
      const headerSummary = header ? Object.values(header).filter((value): value is string => typeof value === "string").join(" · ") : "";
      return compact([plan.title, `${plan.grade} класс`, plan.quarter ? `${plan.quarter} четверть` : "", plan.language === "kz" ? "казахский" : "русский", String(content.schoolProfile ?? ""), headerSummary]);
    }
    case "objectives":
      return compact([
        content.topic,
        ...(content.learningObjectives ?? []).map((objective) => `${objective.code}: ${objective.text}`),
        ...(content.lessonObjectives ?? []),
        ...(content.assessmentCriteria ?? []),
      ]);
    case "context":
      return compact([content.values, content.crossCurricularLinks, content.priorKnowledge]);
    case "beginning":
    case "middle":
    case "end": {
      const stage = content.stages[section];
      return compact([
        stage.time,
        stage.teacherActions,
        stage.studentActions,
        stage.resources,
        `заданий: ${stage.tasks?.length ?? 0}`,
        ...(stage.tasks ?? []).map((task) => task.question),
      ]);
    }
    case "evaluation":
      return compact([
        content.evaluation?.formativeAssessment,
        content.evaluation?.differentiation,
        content.evaluation?.healthAndSafety,
        content.evaluation?.reflection,
      ]);
  }
}

function changedSections(current: LessonPlanRow, previous: LessonPlanRow) {
  return SECTIONS.flatMap((section) =>
    JSON.stringify(sectionSnapshot(current, section)) === JSON.stringify(sectionSnapshot(previous, section))
      ? []
      : [{ section, label: SECTION_LABEL[section], current: sectionPreview(current, section), previous: sectionPreview(previous, section), fields: fieldChanges(current, previous, section) }],
  );
}

/** The owner previews a version and explicitly chooses a whole-plan or section restore. */
export function PlanHistory({
  planId,
  currentUpdatedAt,
  currentPlan,
  versions,
}: {
  planId: string;
  currentUpdatedAt: string;
  currentPlan: LessonPlanRow;
  versions: PlanVersionRow[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<PlanVersionRow | null>(null);
  const [selectedSections, setSelectedSections] = useState<PlanSection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const diffs = selected ? changedSections(currentPlan, selected.plan) : [];

  function showVersion(version: PlanVersionRow) {
    setSelected(version);
    setSelectedSections(changedSections(currentPlan, version.plan).map((change) => change.section));
    setError(null);
  }

  function restore(version: PlanVersionRow, sections?: PlanSection[]) {
    setError(null);
    if (sections && sections.length === 0) {
      setError("Отметьте хотя бы один раздел для выборочного восстановления.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await restorePlanVersionAction({
          plan_id: planId,
          version_id: version.id,
          expected_updated_at: currentUpdatedAt,
          ...(sections ? { sections } : {}),
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

  function toggleSection(section: PlanSection, checked: boolean) {
    setSelectedSections((current) => checked
      ? current.includes(section) ? current : [...current, section]
      : current.filter((item) => item !== section));
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
        <div role="status" className="rounded-2xl border border-[#b9d4c6] bg-[#eef6f1] p-4 text-sm text-[#2f5b4f]">
          Изменения восстановлены; создан новый снимок истории. Текущая публикация и видимость сохранены.
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
                    {formatDate(version.plan.updated_at)} · перед действием «{REASON_LABEL[version.reason]}»
                    {version.is_draft ? " · черновик" : ""}
                  </p>
                  <p className="mt-1 text-sm text-[#5f5751]">
                    Тема: {version.plan.content?.topic || "—"} · {version.plan.title} · {version.plan.grade} класс
                  </p>
                </div>
                <Button variant="outline" type="button" onClick={() => showVersion(version)} aria-expanded={selected?.id === version.id}>
                  <History /> {selected?.id === version.id ? "Сравнение открыто" : "Сравнить"}
                </Button>
              </div>

              {selected?.id === version.id && (
                <div className="mt-4 space-y-4 rounded-xl border border-[#ddd5cb] bg-[#faf7f2] p-4 text-sm">
                  <div>
                    <p className="font-medium">Сравнение с текущим КСП</p>
                    <p className="mt-1 text-xs text-[#5f5751]">Отмеченные разделы будут восстановлены. Ничего не меняется до нажатия кнопки.</p>
                  </div>
                  {diffs.length === 0 ? (
                    <p className="rounded-lg bg-white p-3 text-[#5f5751]">В этих разделах отличий не найдено.</p>
                  ) : (
                    <fieldset className="space-y-3">
                      <legend className="sr-only">Выберите разделы для восстановления</legend>
                      {diffs.map((diff) => (
                        <label key={diff.section} className="block rounded-lg border border-[#ddd5cb] bg-white p-3">
                          <span className="flex items-center gap-2 font-medium">
                            <input
                              type="checkbox"
                              checked={selectedSections.includes(diff.section)}
                              onChange={(event) => toggleSection(diff.section, event.target.checked)}
                            />
                            {diff.label}
                          </span>
                          <span className="mt-2 grid gap-2 pl-6 text-xs text-[#5f5751] md:grid-cols-2">
                            <span><strong>Сейчас:</strong> {diff.current}</span>
                            <span><strong>В выбранной версии:</strong> {diff.previous}</span>
                          </span>
                          {diff.fields.length > 0 && (
                            <ul className="mt-2 list-disc pl-10 text-xs text-[#5f5751]">
                              {diff.fields.slice(0, 8).map((change) => (
                                <li key={change.path}>
                                  {change.kind === "added" ? "Добавлено поле" : change.kind === "removed" ? "Удалено поле" : "Изменено поле"}: <code>{change.path}</code>
                                </li>
                              ))}
                              {diff.fields.length > 8 && <li>Ещё изменений полей: {diff.fields.length - 8}</li>}
                            </ul>
                          )}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <details>
                    <summary className="cursor-pointer font-medium">Полное содержимое выбранной версии</summary>
                    <div className="mt-3"><PlanView plan={version.plan} /></div>
                  </details>
                  <p className="text-xs text-[#745329]">
                    Восстановление создаёт новый снимок. Текущая видимость, публикация и статус черновика не меняются.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" disabled={pending || selectedSections.length === 0} onClick={() => restore(version, selectedSections)}>
                      {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Восстановить отмеченные ({selectedSections.length})
                    </Button>
                    <Button variant="outline" type="button" disabled={pending} onClick={() => restore(version)}>
                      Восстановить всю версию
                    </Button>
                    <Button variant="ghost" type="button" disabled={pending} onClick={() => setSelected(null)}>
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
