/**
 * Types for суммативное оценивание documents:
 *   - SOR (суммативное оценивание за раздел) — section-level summative;
 *   - SOCh (суммативное оценивание за четверть) — quarter-level summative.
 *
 * Both share the same content shape because the structural difference is
 * coverage (one section vs. all sections in a quarter), not document layout.
 *
 * Stored in the public.assessment_papers table; see migration 0009.
 */

export type AssessmentKind = "sor" | "soch";

export type AssessmentTaskType =
  | "open" // открытый вопрос с развёрнутым ответом
  | "test" // тест с одним правильным вариантом
  | "match" // соответствие
  | "fill" // заполнить пропуски
  | "essay"; // эссе / развёрнутый ответ

export interface AssessmentLearningObjective {
  /** Из ГОСО, напр. "5.1.2.1". */
  code: string;
  /** Текст цели обучения. */
  text: string;
}

export interface AssessmentCriterion {
  /** Краткий код критерия — может совпадать с цели обучения, может быть свой. */
  code: string;
  /** Что именно проверяет критерий. */
  descriptor: string;
  /** Номера заданий, проверяющих этот критерий. */
  taskNumbers: number[];
}

export interface AssessmentRubricLevel {
  /** Балл (0..N). */
  points: number;
  /** Условие, при выполнении которого выдаётся это число баллов. */
  descriptor: string;
}

export interface AssessmentTask {
  /** 1-based порядковый номер задания. */
  number: number;
  /** Код связанной цели обучения, напр. "5.1.2.1". */
  learningObjectiveCode: string;
  type: AssessmentTaskType;
  /** Формулировка задания (с подзадачами, если есть). */
  text: string;
  /** Эталонный ответ или ключ — закрыт от ученика, виден учителю. */
  answerKey: string;
  /** Максимальный балл за задание. */
  points: number;
  /** Дескрипторы оценивания (по которым начисляются баллы). */
  descriptors: string[];
}

export interface AssessmentGradeBoundary {
  /** Оценка по 5-балльной шкале (1..5). */
  grade: 1 | 2 | 3 | 4 | 5;
  /** Минимальное число баллов для этой оценки. */
  minPoints: number;
  /** Максимальное число баллов для этой оценки. */
  maxPoints: number;
}

export interface AssessmentContent {
  /** Школа / класс / дата для шапки документа. */
  header: {
    school: string;
    teacherName: string;
    date: string;
    grade: string;
  };
  /** Раздел (для СОР) или перечисление пройденных разделов (для СОЧ). */
  sections: string[];
  /** Длительность в минутах. */
  durationMinutes: number;
  /** Цели обучения, проверяемые работой. */
  learningObjectives: AssessmentLearningObjective[];
  /** Критерии оценивания + к каким заданиям они относятся. */
  criteria: AssessmentCriterion[];
  /** Сами задания. */
  tasks: AssessmentTask[];
  /**
   * Шкала перевода набранных баллов в 5-балльную оценку.
   * Сумма maxPoints всех задач должна попадать в верхнюю границу пятёрки.
   */
  gradeBoundaries: AssessmentGradeBoundary[];
  /** Инструкция для ученика на первой странице (можно оставить пустой). */
  instructions: string;
}

export interface AssessmentPaperRow {
  id: string;
  owner_id: string;
  kind: AssessmentKind;
  title: string;
  subject_id: string | null;
  grade: number;
  quarter: number | null;
  section: string | null;
  duration_minutes: number | null;
  total_points: number | null;
  content: AssessmentContent;
  visibility: "private" | "unlisted" | "public";
  language: "ru" | "kz";
  slug: string | null;
  created_at: string;
  updated_at: string;
}

export function emptyAssessmentContent(): AssessmentContent {
  return {
    header: { school: "", teacherName: "", date: "", grade: "" },
    sections: [],
    durationMinutes: 40,
    learningObjectives: [],
    criteria: [],
    tasks: [],
    gradeBoundaries: [
      { grade: 5, minPoints: 0, maxPoints: 0 },
      { grade: 4, minPoints: 0, maxPoints: 0 },
      { grade: 3, minPoints: 0, maxPoints: 0 },
      { grade: 2, minPoints: 0, maxPoints: 0 },
      { grade: 1, minPoints: 0, maxPoints: 0 },
    ],
    instructions: "",
  };
}

/** Sum of points across all tasks. */
export function totalAssessmentPoints(content: AssessmentContent): number {
  return content.tasks.reduce((s, t) => s + (t.points || 0), 0);
}
