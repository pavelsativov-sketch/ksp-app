import type { WorksheetTask } from "@/lib/handouts/types";
import type { KspContent, LessonKit, MaterialKind, MaterialSlot, StageKey } from "@/lib/types/ksp";
import { ORDER, applyKitToContent, slotTitle } from "./kit";

/**
 * Обратная связь материалов с КСП (docs/lesson-kit-design.md, шаг 5): баллы
 * рабочего листа попадают в колонку «Оценивание», материал, созданный позже,
 * подключается к выбранному этапу. Функции чистые и возвращают копию плана.
 */

type Lang = "ru" | "kz";
const STAGES: StageKey[] = ["beginning", "middle", "end"];
const PREFIX: Record<Lang, string> = { ru: "Рабочий лист, задание", kz: "Жұмыс парағы, тапсырма" };
const POINTS = /\d+\s*балл/i;
/** «— 2 балла», «(1 балл)», «: 3 баллов» в конце дескриптора. */
const POINTS_TAIL = /\s*[(—–:-]*\s*\d+\s*балл[а-яё]*\)?\.?\s*$/i;

export function pointsWord(points: number, language: Lang): string {
  if (language === "kz") return "балл";
  const tens = points % 100;
  const ones = points % 10;
  if (ones === 1 && tens !== 11) return "балл";
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return "балла";
  return "баллов";
}

const isSheetLine = (line: string) => line.startsWith(PREFIX.ru) || line.startsWith(PREFIX.kz);

/** Строки «Оценивания» по заданиям листа: номер как в листе, дескриптор и баллы. */
export function worksheetAssessmentLines(tasks: Array<Pick<WorksheetTask, "descriptor" | "criterion" | "points">>, language: Lang): string[] {
  return tasks
    .map((task, i) => ({ task, n: i + 1 }))
    .filter(({ task }) => task.points > 0)
    .map(({ task, n }) => {
      const text = (task.descriptor || task.criterion || "").trim().replace(/[.;]+$/, "");
      return `${PREFIX[language]} ${n}: ${text} — ${task.points} ${pointsWord(task.points, language)}`;
    });
}

/** Те же баллы для слайда «Оценивание»: «Задание 1. Находит числитель — 2 балла». */
export function worksheetDeckPoints(tasks: Array<Pick<WorksheetTask, "descriptor" | "criterion" | "points">>, language: Lang): string[] {
  const word = language === "kz" ? "Тапсырма" : "Задание";
  return tasks
    .map((task, i) => ({ task, n: i + 1 }))
    .filter(({ task }) => task.points > 0)
    .map(({ task, n }) => `${word} ${n}. ${(task.descriptor || task.criterion || "").trim().replace(/[.;]+$/, "")} — ${task.points} ${pointsWord(task.points, language)}`);
}

/**
 * Баллы листа становятся шкалой урока на 10 баллов: на этапе листа прежние строки
 * с баллами заменяются строками листа, на других этапах дескрипторы остаются без баллов.
 */
export function applyWorksheetAssessment(content: KspContent, stage: StageKey, lines: string[]): KspContent {
  const stages = { ...content.stages };
  for (const key of STAGES) {
    const current = stages[key];
    const descriptors = current.descriptors ?? [];
    stages[key] = key === stage
      ? { ...current, descriptors: [...descriptors.filter((d) => !isSheetLine(d) && !POINTS.test(d)), ...lines] }
      : { ...current, descriptors: descriptors.filter((d) => !isSheetLine(d)).map((d) => d.replace(POINTS_TAIL, "")).filter(Boolean) };
  }
  return { ...content, stages };
}

export type AssessmentState = "none" | "synced" | "stale";

export function assessmentState(content: KspContent, stage: StageKey, lines: string[]): AssessmentState {
  if (lines.length === 0) return "none";
  const descriptors = new Set(content.stages[stage].descriptors ?? []);
  return lines.every((line) => descriptors.has(line)) ? "synced" : "stale";
}

/**
 * Подключает материал к этапу: место в комплекте, действие и строка в «Ресурсах».
 * Повторное подключение переносит материал на другой этап и убирает его со старого.
 */
export function attachMaterial(content: KspContent, input: { kind: MaterialKind; stage: StageKey; title?: string }, language: Lang): KspContent {
  const kit: LessonKit = content.kit ?? { workForms: ["individual"], minutes: 45, slots: [] };
  const existing = kit.slots.find((slot) => slot.kind === input.kind);
  const title = existing?.title ?? input.title ?? slotTitle(input.kind, kit.groups ?? 3, language);
  const placed: MaterialSlot = { id: `slot_${input.kind}`, kind: input.kind, stage: input.stage, status: "ready", title };
  const slots = ORDER
    .map((kind) => (kind === input.kind ? placed : kit.slots.find((slot) => slot.kind === kind)))
    .filter((slot): slot is MaterialSlot => Boolean(slot));
  const workForms = [...kit.workForms];
  if (input.kind === "group_cards" && !workForms.includes("group")) workForms.push("group");
  if (input.kind === "pair_cards" && !workForms.includes("pair")) workForms.push("pair");

  const stages = { ...content.stages };
  for (const key of STAGES) {
    if (key === input.stage) continue;
    const resources = stages[key].resources ?? "";
    stages[key] = { ...stages[key], resources: resources.split("\n").filter((line) => line.trim() !== title).join("\n") };
  }
  return applyKitToContent({ ...content, stages }, { ...kit, workForms, slots });
}
