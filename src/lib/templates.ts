import "server-only";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { COL, getDb, toObjectId } from "@/lib/mongo";
import type { KspContent } from "@/lib/types/ksp";

/**
 * Шаблоны КСП.
 *
 * Учитель ведёт предмет год за годом, и структура уроков у него повторяется:
 * одна и та же «шапка» (школа, учитель, профиль), один и тот же набор целей
 * и формулировки, которые меняются только по теме. Хранить это шаблоном
 * позволяет не заполнять 13 секций заново каждый раз.
 *
 * Шаблон — это снимок плана без привязки к теме. При создании из шаблона
 * берётся структура, а тема и содержание остаются за учителем.
 */
export interface TemplateDoc {
  _id?: ObjectId;
  owner_id: string;
  name: string;
  /** Предмет и класс — чтобы фильтровать шаблоны в списке. */
  subject_id: string | null;
  grade: number | null;
  /** Структура урока: заполненные секции и цели, но без темы. */
  content: KspContent;
  created_at: Date;
  updated_at: Date;
}

export interface TemplateRow {
  id: string;
  name: string;
  subject_id: string | null;
  grade: number | null;
  createdAt: string;
}

const MAX_TEMPLATES = 50;
const templateNameSchema = z.string().trim().min(1, "Укажите название шаблона").max(120);

export const templateNameInputSchema = z.object({ name: templateNameSchema });

/** Поля, которые при создании урока из шаблона нужно заменить или сбросить. */
function toContent(snapshot: KspContent, topic: string): KspContent {
  // Заготовки под конкретный урок не переносятся: иначе новый урок унаследует
  // чужое время, задания и домашнюю работу. Домашка бывает в любом этапе,
  // поэтому чистим её везде, а не только в end.
  const clearStage = (stage: KspContent["stages"]["beginning"]) => ({
    ...stage,
    time: "",
    tasks: [],
    homework: "",
    summary: "",
    reflectionQuestions: [],
  });
  return {
    ...snapshot,
    // Тема задаётся учителем под конкретный урок.
    topic,
    stages: {
      beginning: clearStage(snapshot.stages.beginning),
      middle: clearStage(snapshot.stages.middle),
      end: clearStage(snapshot.stages.end),
    },
  };
}

function toRow(doc: TemplateDoc): TemplateRow {
  return {
    id: doc._id!.toString(),
    name: doc.name,
    subject_id: doc.subject_id,
    grade: doc.grade,
    createdAt: doc.created_at.toISOString(),
  };
}

export async function listTemplates(ownerId: string): Promise<TemplateRow[]> {
  const db = await getDb();
  const rows = await db
    .collection<TemplateDoc>(COL.templates)
    .find({ owner_id: ownerId })
    .sort({ updated_at: -1 })
    .limit(MAX_TEMPLATES)
    .toArray();
  return rows.map(toRow);
}

export async function createTemplate(
  ownerId: string,
  input: { name: string; subject_id?: string | null; grade?: number | null; content: KspContent },
): Promise<{ ok: true; template: TemplateRow } | { ok: false; error: string }> {
  const parsed = templateNameInputSchema.safeParse({ name: input.name });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте название" };
  const db = await getDb();
  const count = await db.collection(COL.templates).countDocuments({ owner_id: ownerId });
  if (count >= MAX_TEMPLATES) {
    return { ok: false, error: `Можно хранить не более ${MAX_TEMPLATES} шаблонов. Удалите лишние.` };
  }
  const now = new Date();
  const content = toContent(input.content, "");
  const created = await db.collection<TemplateDoc>(COL.templates).insertOne({
    owner_id: ownerId,
    name: parsed.data.name,
    subject_id: input.subject_id ?? null,
    grade: input.grade ?? null,
    content,
    created_at: now,
    updated_at: now,
  });
  return {
    ok: true,
    template: {
      id: created.insertedId.toString(),
      name: parsed.data.name,
      subject_id: input.subject_id ?? null,
      grade: input.grade ?? null,
      createdAt: now.toISOString(),
    },
  };
}

export async function deleteTemplate(
  ownerId: string,
  templateId: string,
): Promise<{ ok: boolean; error?: string }> {
  const oid = toObjectId(templateId);
  if (!oid) return { ok: false, error: "Шаблон не найден" };
  const db = await getDb();
  // owner_id в фильтре: чужой шаблон удалить нельзя.
  const res = await db.collection(COL.templates).deleteOne({ _id: oid, owner_id: ownerId });
  if (res.deletedCount === 0) return { ok: false, error: "Шаблон не найден" };
  return { ok: true };
}

/** Заготовка для нового урока: структура шаблона подставлена под тему. */
export async function templateAsPlanContent(
  ownerId: string,
  templateId: string,
  topic: string,
): Promise<KspContent | null> {
  const oid = toObjectId(templateId);
  if (!oid) return null;
  const db = await getDb();
  const doc = await db.collection<TemplateDoc>(COL.templates).findOne({ _id: oid, owner_id: ownerId });
  return doc ? toContent(doc.content, topic) : null;
}
