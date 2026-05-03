import type { KspContent } from "@/lib/types/ksp";
import { richTextToPlain } from "../rich-text-editor";

/**
 * Surface non-blocking issues that don't fail Zod validation but indicate
 * the plan is unfinished. Used to render the yellow "warnings" panel above
 * the Save button so the teacher can decide whether to ship anyway.
 */
export function collectWarnings({
  title,
  topic,
  content,
}: {
  title: string;
  topic: string;
  content: KspContent;
}): string[] {
  const out: string[] = [];
  if (!title.trim()) out.push("Название КСП не заполнено");
  if (!topic.trim()) out.push("Тема урока не указана");
  if (content.learningObjectives.length === 0)
    out.push("Нет целей обучения из программы (ГОСО)");
  if (content.lessonObjectives.length === 0)
    out.push("Нет целей урока (SMART)");
  if (content.assessmentCriteria.length === 0)
    out.push("Не заданы критерии оценивания");
  const anyStage = (
    [
      content.stages.beginning,
      content.stages.middle,
      content.stages.end,
    ] as const
  ).some((s) => richTextToPlain(s.teacherActions).trim().length > 0);
  if (!anyStage) out.push("Нет действий учителя ни в одном этапе урока");
  const totalTasks =
    (content.stages.beginning.tasks?.length ?? 0) +
    (content.stages.middle.tasks?.length ?? 0) +
    (content.stages.end.tasks?.length ?? 0);
  if (totalTasks === 0)
    out.push(
      "Нет интерактивных заданий (добавьте хотя бы одно для вовлечения учеников)",
    );
  if (!content.evaluation.healthAndSafety.trim())
    out.push("Не заполнен раздел «Здоровье и ТБ»");
  return out;
}

/**
 * Coarse-grained completion meter shown next to the Save button. Each
 * field that's filled in adds 1 to `done`. Total is the number of checks
 * — adjust this and the UI percentage updates automatically.
 */
export function computeProgress(
  c: KspContent,
  title: string,
): { percent: number; done: number; total: number } {
  const checks: boolean[] = [
    title.trim().length > 0,
    c.topic.trim().length > 0,
    c.learningObjectives.length > 0,
    c.lessonObjectives.length > 0,
    c.assessmentCriteria.length > 0,
    c.languageObjectives.terms.length + c.languageObjectives.phrases.length > 0,
    c.values.trim().length > 0,
    c.priorKnowledge.trim().length > 0,
    richTextToPlain(c.stages.beginning.teacherActions).trim().length > 0,
    richTextToPlain(c.stages.middle.teacherActions).trim().length > 0,
    richTextToPlain(c.stages.end.teacherActions).trim().length > 0,
    c.evaluation.formativeAssessment.trim().length > 0,
    c.evaluation.reflection.trim().length > 0,
    c.evaluation.healthAndSafety.trim().length > 0,
    (c.stages.beginning.tasks?.length ?? 0) +
      (c.stages.middle.tasks?.length ?? 0) +
      (c.stages.end.tasks?.length ?? 0) >
      0,
  ];
  const total = checks.length;
  const done = checks.filter(Boolean).length;
  return { percent: Math.round((done / total) * 100), done, total };
}
