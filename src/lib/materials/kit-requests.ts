import type { LessonKit, MaterialKind, MaterialSlot } from "@/lib/types/ksp";

/**
 * Фоновое создание материалов комплекта (docs/lesson-kit-design.md, шаг 4): какой
 * запрос создаёт материал слота. Маршруты те же, что у кнопок урока, и сами
 * сохраняют результат в урок, поэтому учитель может уйти со страницы.
 */

export interface KitLessonContext {
  planId: string;
  topic: string;
  subject: string;
  grade: number;
  language: "ru" | "kz";
  kspContext?: { learningObjectives: string[]; assessmentCriteria: string[]; stages: Array<{ stage: string; activities: string }> };
  values?: string;
}

export interface SlotRequest {
  url: string;
  body: Record<string, unknown>;
}

/** Лист ООП строится из рабочего листа на месте, интерактив уже лежит в этапах КСП. */
export const DERIVED_KINDS: Partial<Record<MaterialKind, MaterialKind | "plan">> = { oop_sheet: "worksheet", interactive: "plan" };

export function slotRequest(slot: MaterialSlot, kit: LessonKit, ctx: KitLessonContext): SlotRequest | null {
  const base = { topic: ctx.topic, subject: ctx.subject, grade: ctx.grade, language: ctx.language, planId: ctx.planId, stage: slot.stage };
  switch (slot.kind) {
    case "worksheet":
      // Лист красочный, как в образцах учителя: с иллюстрацией.
      return { url: "/api/handouts/generate", body: { ...base, kind: "worksheet", count: 6, withImages: true, kspContext: ctx.kspContext } };
    case "crossword":
      return { url: "/api/handouts/generate", body: { ...base, kind: "crossword", count: 8, kspContext: ctx.kspContext } };
    case "flashcards":
      return { url: "/api/handouts/generate", body: { ...base, kind: "flashcards", count: 6, kspContext: ctx.kspContext } };
    case "group_cards":
    case "pair_cards":
      return {
        url: "/api/handouts/group",
        body: {
          ...base,
          mode: slot.kind === "pair_cards" ? "pair" : "group",
          count: kit.groups ?? 3,
          learningObjectives: ctx.kspContext?.learningObjectives,
          values: kit.value || ctx.values || undefined,
        },
      };
    case "deck":
      return { url: "/api/materials/deck", body: { planId: ctx.planId } };
    default:
      return null;
  }
}

export type SlotStatus = MaterialSlot["status"];

/**
 * Статус слота по тому, что уже сохранено в уроке. Производный слот готов вместе
 * со своим источником; запущенный недавно и ещё не готовый считается «готовится».
 */
export function slotStatus(slot: MaterialSlot, saved: ReadonlySet<MaterialKind>, startedAt: number | undefined, now: number, windowMs: number): SlotStatus {
  const source = DERIVED_KINDS[slot.kind];
  if (source === "plan") return "ready";
  const kind = source ?? slot.kind;
  if (saved.has(kind)) return "ready";
  if (startedAt !== undefined && now - startedAt < windowMs) return "generating";
  return "planned";
}
