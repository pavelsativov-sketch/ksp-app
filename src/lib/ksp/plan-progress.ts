import type { KspContent } from "@/lib/types/ksp";
import { dictionaries, type Dict } from "@/lib/i18n/dictionaries";

/** Тексты предупреждений редактора: берутся из словаря активной локали. */
export type WarningItems = Dict["planEditor"]["warningItems"];

export interface PlanProgress {
  percent: number;
  done: number;
  total: number;
}

export function computeProgress(c: KspContent, title: string): PlanProgress {
  const isNonEmptyStr = (val: unknown) => typeof val === "string" && val.trim().length > 0;
  const isNonEmptyArr = (val: unknown) => Array.isArray(val) && val.length > 0;

  const checks: boolean[] = [
    isNonEmptyStr(title),
    isNonEmptyStr(c.topic),
    isNonEmptyArr(c.learningObjectives),
    isNonEmptyArr(c.lessonObjectives),
    isNonEmptyArr(c.assessmentCriteria),
    isNonEmptyArr(c.languageObjectives?.terms) || isNonEmptyArr(c.languageObjectives?.phrases),
    isNonEmptyStr(c.values),
    isNonEmptyStr(c.priorKnowledge),
    isNonEmptyStr(c.stages?.beginning?.teacherActions),
    isNonEmptyStr(c.stages?.middle?.teacherActions),
    isNonEmptyStr(c.stages?.end?.teacherActions),
    isNonEmptyStr(c.evaluation?.formativeAssessment),
    isNonEmptyStr(c.evaluation?.reflection),
    isNonEmptyStr(c.evaluation?.healthAndSafety),
    // Interactive tasks present anywhere
    (c.stages?.beginning?.tasks?.length ?? 0) +
      (c.stages?.middle?.tasks?.length ?? 0) +
      (c.stages?.end?.tasks?.length ?? 0) >
      0,
  ];
  const total = checks.length;
  const done = checks.filter(Boolean).length;
  return { percent: Math.round((done / total) * 100), done, total };
}

export function collectWarnings(
  { title, topic, content }: { title: string; topic: string; content: KspContent },
  /** Тексты предупреждений. По умолчанию — русские: так ведут себя чистые вызовы вне UI. */
  labels: WarningItems = dictionaries.ru.planEditor.warningItems,
): string[] {
  const out: string[] = [];
  const isNonEmptyStr = (val: unknown) => typeof val === "string" && val.trim().length > 0;

  if (!isNonEmptyStr(title)) out.push(labels.noTitle);
  if (!isNonEmptyStr(topic)) out.push(labels.noTopic);
  if (!content?.learningObjectives?.length) out.push(labels.noLearningObjectives);
  if (!content?.lessonObjectives?.length) out.push(labels.noLessonObjectives);
  if (!content?.assessmentCriteria?.length) out.push(labels.noCriteria);

  const anyStage = (
    [content?.stages?.beginning, content?.stages?.middle, content?.stages?.end] as const
  ).some((s) => isNonEmptyStr(s?.teacherActions));
  if (!anyStage) out.push(labels.noTeacherActions);

  const totalTasks =
    (content?.stages?.beginning?.tasks?.length ?? 0) +
    (content?.stages?.middle?.tasks?.length ?? 0) +
    (content?.stages?.end?.tasks?.length ?? 0);
  if (totalTasks === 0) out.push(labels.noTasks);

  if (!isNonEmptyStr(content?.evaluation?.healthAndSafety)) out.push(labels.noHealth);
  return out;
}
