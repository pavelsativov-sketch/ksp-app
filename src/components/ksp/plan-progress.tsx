"use client";

import { useMemo } from "react";
import { CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { computeProgress, collectWarnings } from "@/lib/ksp/plan-progress";
import type { KspContent } from "@/lib/types/ksp";

interface PlanProgressProps {
  content: KspContent;
  title: string;
  compact?: boolean;
}

interface SectionStatus {
  key: string;
  label: string;
  done: boolean;
  partial: boolean;
}

export function PlanProgress({ content, title, compact = false }: PlanProgressProps) {
  const progress = useMemo(() => computeProgress(content, title), [content, title]);
  const warnings = useMemo(() => collectWarnings({ title, topic: content.topic, content }), [title, content]);

  const sections: SectionStatus[] = [
    { key: "meta", label: "Метаданные", done: Boolean(title.trim()), partial: false },
    { key: "topic", label: "Тема", done: Boolean(content.topic.trim()), partial: false },
    { key: "objectives", label: "Цели", done: content.lessonObjectives.length >= 3, partial: content.lessonObjectives.length > 0 },
    { key: "criteria", label: "Критерии", done: content.assessmentCriteria.length >= 3, partial: content.assessmentCriteria.length > 0 },
    { key: "terms", label: "Термины", done: content.languageObjectives.terms.length >= 5, partial: content.languageObjectives.terms.length > 0 },
    { key: "beginning", label: "Начало", done: Boolean(content.stages.beginning.teacherActions.trim()), partial: false },
    { key: "middle", label: "Середина", done: Boolean(content.stages.middle.teacherActions.trim()), partial: false },
    { key: "end", label: "Конец", done: Boolean(content.stages.end.teacherActions.trim()), partial: false },
    { key: "evaluation", label: "Оценивание", done: Boolean(content.evaluation.formativeAssessment.trim()), partial: false },
  ];

  const qualityScore = Math.round((progress.done / progress.total) * 100);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all duration-500 ${qualityScore >= 80 ? "bg-emerald-500" : qualityScore >= 50 ? "bg-amber-500" : "bg-red-500"}`}
            style={{ width: `${qualityScore}%` }}
          />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{qualityScore}%</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Прогресс заполнения</h3>
        <span className={`text-sm font-bold ${qualityScore >= 80 ? "text-emerald-600" : qualityScore >= 50 ? "text-amber-600" : "text-red-600"}`}>
          {qualityScore}%
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-all duration-500 ${qualityScore >= 80 ? "bg-emerald-500" : qualityScore >= 50 ? "bg-amber-500" : "bg-red-500"}`}
          style={{ width: `${qualityScore}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {sections.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs">
            {s.done ? (
              <CheckCircle2 className="size-3.5 text-emerald-500" />
            ) : s.partial ? (
              <AlertCircle className="size-3.5 text-amber-500" />
            ) : (
              <Circle className="size-3.5 text-muted-foreground" />
            )}
            <span className={s.done ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
          </div>
        ))}
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs font-medium text-amber-800 mb-1">Требует внимания:</p>
          <ul className="text-xs text-amber-700 space-y-0.5">
            {warnings.slice(0, 3).map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
