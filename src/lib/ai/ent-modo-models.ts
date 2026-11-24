import { z } from "zod";

export const examKindSchema = z.enum(["modo_4", "modo_9", "ent_11"]);
export type ExamKind = z.infer<typeof examKindSchema>;

export const singleChoiceItemSchema = z.object({
  number: z.number().int().min(1).max(60),
  objectiveCode: z.string().trim().max(80).default(""),
  prompt: z.string().trim().min(3).max(2000),
  options: z.array(z.string().trim().min(1).max(500)).length(4),
  correctIndex: z.number().int().min(0).max(3).catch(0),
  points: z.literal(1).default(1),
  explanation: z.string().trim().max(1000).default(""),
});

export const multiChoiceItemSchema = z.object({
  number: z.number().int().min(1).max(60),
  objectiveCode: z.string().trim().max(80).default(""),
  prompt: z.string().trim().min(3).max(2000),
  options: z.array(z.string().trim().min(1).max(500)).length(6),
  correctIndices: z
    .array(z.number().int().min(0).max(5))
    .min(1)
    .max(3)
    .transform((arr) => Array.from(new Set(arr)).sort((a, b) => a - b)),
  points: z.literal(2).default(2),
  explanation: z.string().trim().max(1000).default(""),
});

export const contextBlockSchema = z.object({
  title: z.string().trim().min(2).max(240),
  passage: z.string().trim().min(20).max(4000),
  questions: z.array(singleChoiceItemSchema).min(2).max(6),
});

export const entModoWorkSchema = z.object({
  title: z.string().trim().min(3).max(240),
  examKind: examKindSchema,
  subject: z.string().trim().min(2).max(140),
  grade: z.number().int().min(4).max(11),
  language: z.enum(["ru", "kz"]),
  durationMinutes: z.number().int().min(15).max(180).default(45),
  maxPoints: z.number().int().min(5).max(80),
  partA: z.array(singleChoiceItemSchema).min(3).max(25),
  contextBlock: contextBlockSchema,
  partC: z.array(multiChoiceItemSchema).max(10).default([]),
});

export type SingleChoiceItem = z.infer<typeof singleChoiceItemSchema>;
export type MultiChoiceItem = z.infer<typeof multiChoiceItemSchema>;
export type EntModoContextBlock = z.infer<typeof contextBlockSchema>;
export type EntModoWork = z.infer<typeof entModoWorkSchema>;

/**
 * Официальная шкала НЦТ РК для заданий ЕНТ с множественным выбором (1–3 верных из 6, макс. 2 балла):
 *  - Полное совпадение всех правильных ответов без лишних -> 2 балла;
 *  - Ровно 1 ошибка (либо 1 неверный лишний вариант, либо 1 недовыбранный правильный, при 1..3 выбранных) -> 1 балл;
 *  - 2 и более ошибок, пустой ответ или выбрано >3 вариантов -> 0 баллов.
 */
export function scoreEntMultiSelect(selected: number[], correct: number[]): 0 | 1 | 2 {
  const cleanSelected = Array.from(new Set(selected)).filter((i) => i >= 0 && i <= 5);
  const cleanCorrect = Array.from(new Set(correct)).filter((i) => i >= 0 && i <= 5);
  if (cleanSelected.length === 0 || cleanSelected.length > 3 || cleanCorrect.length === 0) {
    return 0;
  }
  const selectedSet = new Set(cleanSelected);
  const correctSet = new Set(cleanCorrect);

  let missing = 0;
  for (const c of correctSet) {
    if (!selectedSet.has(c)) missing++;
  }
  let extra = 0;
  for (const s of selectedSet) {
    if (!correctSet.has(s)) extra++;
  }

  const mistakes = missing + extra;
  if (mistakes === 0) return 2;
  if (mistakes === 1) return 1;
  return 0;
}

export interface TrainerAnswersState {
  single: Record<number, number | null>;
  multi: Record<number, number[]>;
}

export interface TrainerEvaluationResult {
  score: number;
  maxPoints: number;
  percent: number;
  perQuestion: Record<number, { earned: number; max: number; isFull: boolean }>;
  byObjective: Array<{ code: string; earned: number; max: number; percent: number }>;
}

export function evaluateEntModoAttempt(
  work: EntModoWork,
  answers: TrainerAnswersState,
): TrainerEvaluationResult {
  let score = 0;
  const perQuestion: Record<number, { earned: number; max: number; isFull: boolean }> = {};
  const objTotals = new Map<string, { earned: number; max: number }>();

  const record = (num: number, code: string, earned: number, max: number) => {
    score += earned;
    perQuestion[num] = { earned, max, isFull: earned === max };
    const key = code.trim() || "Общие навыки";
    const cur = objTotals.get(key) ?? { earned: 0, max: 0 };
    cur.earned += earned;
    cur.max += max;
    objTotals.set(key, cur);
  };

  for (const q of work.partA) {
    const picked = answers.single[q.number];
    const earned = picked === q.correctIndex ? 1 : 0;
    record(q.number, q.objectiveCode, earned, 1);
  }

  for (const q of work.contextBlock.questions) {
    const picked = answers.single[q.number];
    const earned = picked === q.correctIndex ? 1 : 0;
    record(q.number, q.objectiveCode, earned, 1);
  }

  for (const q of work.partC) {
    const picked = answers.multi[q.number] ?? [];
    const earned = scoreEntMultiSelect(picked, q.correctIndices);
    record(q.number, q.objectiveCode, earned, 2);
  }

  const maxPoints =
    work.partA.length + work.contextBlock.questions.length + work.partC.length * 2;
  const percent = maxPoints > 0 ? Math.round((score / maxPoints) * 100) : 0;

  const byObjective = Array.from(objTotals.entries()).map(([code, stat]) => ({
    code,
    earned: stat.earned,
    max: stat.max,
    percent: stat.max > 0 ? Math.round((stat.earned / stat.max) * 100) : 0,
  }));

  return {
    score,
    maxPoints,
    percent,
    perQuestion,
    byObjective,
  };
}

const LETTERS_6 = ["A", "B", "C", "D", "E", "F"] as const;

export function entModoToInteractiveTasks(
  work: EntModoWork,
): import("@/lib/ksp/tasks").InteractiveTask[] {
  const out: import("@/lib/ksp/tasks").InteractiveTask[] = [];
  const isKz = work.language === "kz";

  for (const q of work.partA) {
    out.push({
      id: `ent-a-${q.number}`,
      type: "MCQ",
      question: q.prompt,
      options: q.options,
      correctIndex: q.correctIndex,
      points: 1,
      ...(q.objectiveCode ? { objectiveCode: q.objectiveCode } : {}),
      ...(q.explanation ? { hint: q.explanation.slice(0, 400) } : {}),
    });
  }

  work.contextBlock.questions.forEach((q, idx) => {
    const contextHeader =
      idx === 0
        ? `Контекст «${work.contextBlock.title}»:\n${work.contextBlock.passage}\n\n${isKz ? "Сұрақ" : "Вопрос"}: ${q.prompt}`
        : `(${isKz ? "Контекст бойынша" : "По тексту"} «${work.contextBlock.title}») ${q.prompt}`;
    out.push({
      id: `ent-b-${q.number}`,
      type: "MCQ",
      question: contextHeader.slice(0, 4800),
      options: q.options,
      correctIndex: q.correctIndex,
      points: 1,
      ...(q.objectiveCode ? { objectiveCode: q.objectiveCode } : {}),
      ...(q.explanation ? { hint: q.explanation.slice(0, 400) } : {}),
    });
  });

  for (const q of work.partC) {
    const letters = q.correctIndices.map((i) => LETTERS_6[i] ?? "A");
    const accepted = Array.from(
      new Set([letters.join(", "), letters.join(","), letters.join(" "), letters.join("")]),
    );
    const optionsList = q.options.map((o, idx) => `${LETTERS_6[idx]}) ${o}`).join("\n");
    const instruction = isKz
      ? "Дұрыс жауап әріптерін өсу ретімен жазыңыз (мысалы: A, C):"
      : "Введите буквы всех правильных ответов по алфавиту (например: A, C):";

    out.push({
      id: `ent-c-${q.number}`,
      type: "SHORT_ANSWER",
      question: `${q.prompt}\n\n${optionsList}\n\n${instruction}`.slice(0, 4800),
      acceptedAnswers: accepted,
      points: 2,
      ...(q.objectiveCode ? { objectiveCode: q.objectiveCode } : {}),
      ...(q.explanation ? { hint: q.explanation.slice(0, 400) } : {}),
    });
  }

  return out.slice(0, 40);
}
