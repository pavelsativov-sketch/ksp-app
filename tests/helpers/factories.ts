/**
 * Фабрики тестовых данных для unit-тестов.
 *
 * Каждая фабрика возвращает минимальный, но валидный объект с разумными
 * значениями по умолчанию. Тест переопределяет только те поля, которые
 * проверяет — как в примере:
 *
 *   const plan = makePlan({ title: "Дроби", grade: 5 });
 */
import { ObjectId } from "mongodb";
import type { PlanDoc } from "@/lib/plans-repo";
import type { PlanVersionDoc } from "@/lib/plan-versions";
import type { TemplateDoc } from "@/lib/templates";
import type { KitDoc } from "@/lib/kits";
import type { UserBillingFields } from "@/lib/billing/plans";
import type { BillingCodeDocument } from "@/lib/billing/redeem";
import type { PlanReportDoc } from "@/lib/moderation";
import type { TextbookDoc } from "@/lib/rag/ingest";
import type { Handout } from "@/lib/handouts/types";
import { emptyKsp, type KspContent, type LessonPlanRow } from "@/lib/types/ksp";

let seq = 0;
/** Уникальный 24-hex ObjectId-строка для тестов. */
export function testId(): string {
  seq += 1;
  return String(seq).padStart(24, "0");
}

export function makeKspContent(overrides: Partial<KspContent> = {}): KspContent {
  return { ...emptyKsp(), ...overrides };
}

export function makePlan(overrides: Partial<PlanDoc> = {}): PlanDoc {
  const now = new Date("2026-09-17T12:00:00.000Z");
  return {
    _id: new ObjectId(testId()),
    owner_id: "a".repeat(24),
    title: "Тестовый план",
    subject_id: null,
    grade: 5,
    quarter: null,
    section: null,
    content: makeKspContent({ topic: "Тема урока" }),
    visibility: "private",
    language: "ru",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function makePlanRow(overrides: Partial<LessonPlanRow> = {}): LessonPlanRow {
  const plan = makePlan(overrides as Partial<PlanDoc>);
  return {
    id: plan._id!.toString(),
    owner_id: plan.owner_id,
    title: plan.title,
    subject_id: plan.subject_id,
    grade: plan.grade,
    quarter: plan.quarter,
    class_id: plan.class_id ?? null,
    section: plan.section,
    content: plan.content,
    visibility: plan.visibility,
    language: plan.language,
    created_at: plan.created_at.toISOString(),
    updated_at: plan.updated_at.toISOString(),
    ...overrides,
  };
}

export function makePlanVersion(plan: PlanDoc, overrides: Partial<PlanVersionDoc> = {}): PlanVersionDoc {
  return {
    _id: new ObjectId(testId()),
    plan_id: plan._id!.toHexString(),
    owner_id: plan.owner_id,
    created_at: new Date("2026-09-17T12:00:00.000Z"),
    reason: "save",
    snapshot: {
      title: plan.title,
      subject_id: plan.subject_id,
      grade: plan.grade,
      quarter: plan.quarter,
      section: plan.section,
      content: plan.content,
      visibility: plan.visibility,
      language: plan.language,
      is_draft: plan.is_draft ?? false,
      class_id: plan.class_id ?? null,
      updated_at: plan.updated_at,
    },
    ...overrides,
  };
}

export function makeTemplate(ownerId = "a".repeat(24), overrides: Partial<TemplateDoc> = {}): TemplateDoc {
  const now = new Date("2026-09-17T12:00:00.000Z");
  return {
    _id: new ObjectId(testId()),
    owner_id: ownerId,
    name: "Шаблон КСП",
    subject_id: null,
    grade: 5,
    content: makeKspContent(),
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function makeKit(ownerId = "a".repeat(24), overrides: Partial<KitDoc> = {}): KitDoc {
  const now = new Date("2026-09-17T12:00:00.000Z");
  return {
    _id: new ObjectId(testId()),
    owner_id: ownerId,
    title: "Комлект материалов",
    topic: "Тема",
    subject_id: null,
    grade: 5,
    class_id: null,
    handouts: [makeHandout()],
    extra: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function makeUser(overrides: Partial<UserBillingFields> = {}): UserBillingFields {
  return { plan: "free", plan_expires_at: null, ...overrides };
}

export function makeBillingCode(overrides: Partial<BillingCodeDocument> = {}): BillingCodeDocument {
  return {
    _id: new ObjectId(testId()),
    codeHash: "a".repeat(64),
    type: "pro_1m",
    status: "active",
    redeemed_by: null,
    redeemed_at: null,
    created_at: new Date("2026-09-17T12:00:00.000Z"),
    ...overrides,
  };
}

export function makeReport(overrides: Partial<PlanReportDoc> = {}): PlanReportDoc {
  return {
    _id: new ObjectId(testId()),
    plan_id: "c".repeat(24),
    reporter_id: "b".repeat(24),
    reason: "spam",
    details: "",
    status: "open",
    resolved_by: null,
    resolved_at: null,
    created_at: new Date("2026-09-17T12:00:00.000Z"),
    ...overrides,
  };
}

export function makeTextbook(overrides: Partial<TextbookDoc> = {}): TextbookDoc {
  const now = new Date("2026-09-17T12:00:00.000Z");
  return {
    _id: new ObjectId(testId()),
    owner_id: "a".repeat(24),
    title: "Учебник",
    subject_id: null,
    grade: 5,
    status: "ready",
    status_error: null,
    page_count: 100,
    chunk_count: 10,
    visibility: "private",
    has_embeddings: true,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function makeHandout(overrides: Partial<Handout> = {}): Handout {
  return {
    kind: "worksheet",
    title: "Рабочий лист",
    intro: "",
    metaLine: "Класс: 5",
    tasks: [],
    ...overrides,
  } as Handout;
}
