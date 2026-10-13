/**
 * Репозиторий планов/предметов/целей поверх MongoDB.
 */

import { getDb, COL, toObjectId } from "@/lib/mongo";
import { kspContentSchema } from "@/lib/validation/ksp";
import { emptyKsp } from "@/lib/types/ksp";
import type {
  LessonPlanRow,
  SubjectRow,
  LearningObjectiveRow,
  Visibility,
  Language,
  KspContent,
} from "@/lib/types/ksp";
import type { ObjectId } from "mongodb";

/**
 * Миграция-on-read: документы, записанные до появления новых полей схемы,
 * дополняем дефолтами, чтобы рендер/экспорт не падали на старых планах.
 */
function normalizeContent(raw: unknown): KspContent {
  const parsed = kspContentSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const base = emptyKsp();
  const r = (raw ?? {}) as Partial<KspContent>;
  return {
    ...base,
    ...r,
    header: { ...base.header, ...(r.header ?? {}) },
    languageObjectives: {
      terms: r.languageObjectives?.terms ?? base.languageObjectives.terms,
      phrases: r.languageObjectives?.phrases ?? base.languageObjectives.phrases,
    },
    stages: {
      beginning: { ...base.stages.beginning, ...(r.stages?.beginning ?? {}) },
      middle: { ...base.stages.middle, ...(r.stages?.middle ?? {}) },
      end: { ...base.stages.end, ...(r.stages?.end ?? {}) },
    },
    evaluation: { ...base.evaluation, ...(r.evaluation ?? {}) },
  };
}

export interface PlanDoc {
  _id?: ObjectId;
  owner_id: string;
  title: string;
  subject_id: string | null;
  grade: number;
  quarter: number | null;
  section: string | null;
  content: KspContent;
  visibility: Visibility;
  language: Language;
  /** Привязка к классу или группе учителя (teacher_classes). */
  class_id?: string | null;
  /** Черновик, сохранённый на сервере (до первого полного сохранения). */
  is_draft?: boolean;
  /** Скрыт модерацией: не показывается в библиотеке и чужим по ссылке. */
  moderation_hidden?: boolean;
  /** Internal marker updated atomically with school approval-cycle creation. */
  last_approval_cycle_id?: string;
  hidden_at?: Date;
  hidden_by?: string;
  created_at: Date;
  updated_at: Date;
}

export function toPlanRow(doc: PlanDoc): LessonPlanRow {
  return {
    id: doc._id ? doc._id.toString() : "",

    owner_id: doc.owner_id,
    title: doc.title,
    subject_id: doc.subject_id,
    grade: doc.grade,
    quarter: doc.quarter,
    class_id: doc.class_id ?? null,
    section: doc.section,
    content: normalizeContent(doc.content),
    visibility: doc.visibility,
    language: doc.language,
    moderationHidden: doc.moderation_hidden === true,
    created_at: doc.created_at.toISOString(),
    updated_at: doc.updated_at.toISOString(),
  };
}

/** План по id либо null. */
export async function getPlanById(id: string): Promise<LessonPlanRow | null> {
  const oid = toObjectId(id);
  if (!oid) return null;
  const db = await getDb();
  const doc = await db.collection<PlanDoc>(COL.plans).findOne({ _id: oid });
  return doc ? toPlanRow(doc) : null;
}

/** План, доступный пользователю: свой, публичный или unlisted по прямой ссылке. */
export async function getAccessiblePlan(
  id: string,
  userId: string | null,
): Promise<LessonPlanRow | null> {
  const plan = await getPlanById(id);
  if (!plan) return null;
  if (plan.owner_id === userId) return plan;
  // Скрытый модерацией план чужим не показывается, даже по прямой ссылке.
  if (plan.moderationHidden) return null;
  if (plan.visibility !== "private") return plan;
  return null;
}

export async function listSubjects(): Promise<SubjectRow[]> {
  const db = await getDb();
  const docs = await db
    .collection<SubjectDoc>(COL.subjects)
    .find()
    .sort({ name_ru: 1 })
    .toArray();
  return docs.map(toSubjectRow);
}

interface SubjectDoc {
  _id: ObjectId;
  name_ru: string;
  name_kz: string | null;
  grade_min: number;
  grade_max: number;
}

export function toSubjectRow(doc: SubjectDoc): SubjectRow {
  return {
    id: doc._id.toString(),
    name_ru: doc.name_ru,
    name_kz: doc.name_kz,
    grade_min: doc.grade_min,
    grade_max: doc.grade_max,
  };
}

export async function getSubjectById(id: string): Promise<SubjectRow | null> {
  const oid = toObjectId(id);
  if (!oid) return null;
  const db = await getDb();
  const doc = await db.collection<SubjectDoc>(COL.subjects).findOne({ _id: oid });
  return doc ? toSubjectRow(doc) : null;
}

export async function getSubjectByName(name: string): Promise<SubjectRow | null> {
  const db = await getDb();
  const doc = await db.collection<SubjectDoc>(COL.subjects).findOne({ name_ru: name });
  return doc ? toSubjectRow(doc) : null;
}

export async function findObjectives(opts: {
  subjectId: string;
  grade?: number;
  search?: string;
  limit?: number;
}): Promise<LearningObjectiveRow[]> {
  const oid = toObjectId(opts.subjectId);
  if (!oid) return [];
  const db = await getDb();
  const filter: Record<string, unknown> = { subject_id: opts.subjectId };
  if (opts.grade !== undefined) filter.grade = opts.grade;
  if (opts.search) filter.text_ru = { $regex: escapeRegex(opts.search), $options: "i" };
  const docs = await db
    .collection(COL.objectives)
    .find(filter)
    .sort({ code: 1 })
    .limit(opts.limit ?? 500)
    .toArray();
  return docs.map((d) => ({
    id: (d._id as ObjectId).toString(),
    subject_id: d.subject_id,
    grade: d.grade,
    code: d.code,
    text_ru: d.text_ru,
    text_kz: d.text_kz ?? null,
    section: d.section ?? null,
  }));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
