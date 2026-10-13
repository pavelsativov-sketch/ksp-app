import "server-only";
import type { ClientSession, Db, ObjectId } from "mongodb";
import { COL, getDb, toObjectId } from "@/lib/mongo";
import { toPlanRow, type PlanDoc } from "@/lib/plans-repo";
import type { LessonPlanRow } from "@/lib/types/ksp";
import { PLAN_VERSION_SECTIONS, type PlanSection } from "@/lib/plan-sections";
export { PLAN_VERSION_SECTIONS, type PlanSection } from "@/lib/plan-sections";

export const MAX_PLAN_VERSIONS = 30;
export const MAX_PLAN_BYTES = 256 * 1024;
export const PLAN_CONFLICT = "План изменился. Обновите страницу перед сохранением или восстановлением.";
export type PlanState = Pick<PlanDoc, "title" | "subject_id" | "grade" | "quarter" | "section" | "content" | "visibility" | "language" | "is_draft"> & { class_id?: string | null };
export interface PlanVersionDoc {
  _id?: ObjectId;
  plan_id: string;
  owner_id: string;
  created_at: Date;
  reason: "save" | "draft" | "restore";
  snapshot: PlanState & { updated_at: Date };
}
export interface PlanVersionRow {
  id: string;
  created_at: string;
  reason: PlanVersionDoc["reason"];
  is_draft: boolean;
  plan: LessonPlanRow;
}

export function planState(plan: PlanState): PlanState {
  return {
    title: plan.title, subject_id: plan.subject_id, grade: plan.grade,
    quarter: plan.quarter, section: plan.section, content: plan.content,
    visibility: plan.visibility, language: plan.language, is_draft: plan.is_draft ?? false,
    class_id: plan.class_id ?? null,
  };
}

export function isBoundedPlan(input: unknown): boolean {
  try { return Buffer.byteLength(JSON.stringify(input), "utf8") <= MAX_PLAN_BYTES; }
  catch { return false; }
}

function checkRevision(current: PlanDoc, expected: string | undefined) {
  if (typeof expected !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expected) ||
      expected !== current.updated_at.toISOString()) throw new Error(PLAN_CONFLICT);
}

async function snapshotAndTrim(db: Db, session: ClientSession, current: PlanDoc & { _id: ObjectId }, reason: PlanVersionDoc["reason"], now: Date) {
  const snapshot = { ...planState(current), updated_at: current.updated_at };
  if (!isBoundedPlan(snapshot)) throw new Error("Предыдущая версия слишком большая для истории. Изменения не сохранены.");
  const versions = db.collection<PlanVersionDoc>(COL.planVersions);
  const scope = { plan_id: current._id.toHexString(), owner_id: current.owner_id };
  await versions.insertOne({ ...scope, created_at: now, reason, snapshot }, { session });
  const stale = await versions.find(scope, { session, projection: { _id: 1 } })
    .sort({ created_at: -1, _id: -1 }).skip(MAX_PLAN_VERSIONS).toArray();
  if (stale.length) await versions.deleteMany({ ...scope, _id: { $in: stale.map(v => v._id) } }, { session });
}

function restoredPlanState(current: PlanDoc, snapshot: PlanState, sections?: readonly PlanSection[]): PlanState {
  const currentState = planState(current);
  const snapshotState = planState(snapshot);
  if (!sections) {
    return { ...snapshotState, visibility: current.visibility, is_draft: current.is_draft ?? false };
  }

  const selected = new Set(sections);
  let state = currentState;
  let content = { ...current.content };
  if (selected.has("metadata")) {
    state = {
      ...state,
      title: snapshotState.title,
      subject_id: snapshotState.subject_id,
      grade: snapshotState.grade,
      quarter: snapshotState.quarter,
      section: snapshotState.section,
      class_id: snapshotState.class_id,
      language: snapshotState.language,
    };
    content = { ...content, schoolProfile: snapshotState.content.schoolProfile, header: snapshotState.content.header };
  }
  if (selected.has("objectives")) {
    content = {
      ...content,
      topic: snapshotState.content.topic,
      learningObjectives: snapshotState.content.learningObjectives,
      lessonObjectives: snapshotState.content.lessonObjectives,
      assessmentCriteria: snapshotState.content.assessmentCriteria,
      languageObjectives: snapshotState.content.languageObjectives,
    };
  }
  if (selected.has("context")) {
    content = {
      ...content,
      values: snapshotState.content.values,
      crossCurricularLinks: snapshotState.content.crossCurricularLinks,
      priorKnowledge: snapshotState.content.priorKnowledge,
    };
  }
  for (const stage of ["beginning", "middle", "end"] as const) {
    if (selected.has(stage)) {
      content = { ...content, stages: { ...content.stages, [stage]: snapshotState.content.stages[stage] } };
    }
  }
  if (selected.has("evaluation")) content = { ...content, evaluation: snapshotState.content.evaluation };
  return { ...state, content, visibility: current.visibility, is_draft: current.is_draft ?? false };
}

/** Caller supplies owner ID from the authenticated server session, never client input. */
export async function updatePlanWithVersion(id: string, ownerId: string, expected: string | undefined,
  change: { state: PlanState; reason: "save" | "draft" } | { versionId: string; sections?: readonly PlanSection[] }) {
  const oid = toObjectId(id);
  if (!oid) throw new Error("Некорректный id");
  const versionId = "versionId" in change ? toObjectId(change.versionId) : null;
  if ("versionId" in change && !versionId) throw new Error("Версия не найдена");
  const db = await getDb();
  const session = db.client.startSession();
  try {
    return await session.withTransaction(async () => {
      const plans = db.collection<PlanDoc>(COL.plans);
      const scope = { _id: oid, owner_id: ownerId };
      const current = await plans.findOne(scope, { session });
      if (!current) throw new Error("План не найден");
      checkRevision(current, expected);
      let state: PlanState;
      if ("versionId" in change) {
        const version = await db.collection<PlanVersionDoc>(COL.planVersions).findOne(
          { _id: versionId!, plan_id: oid.toHexString(), owner_id: ownerId }, { session });
        if (!version) throw new Error("Версия не найдена");
        // Content can be restored selectively; publication state always stays current.
        state = restoredPlanState(current, version.snapshot, change.sections);
      } else {
        state = planState(change.state);
        // Автосохранение черновика НЕ имеет права менять решение о публикации.
        //
        // Раньше saveDraftAction всегда клал visibility: "private" и
        // is_draft: true, и для уже существующего плана это применялось
        // поверх текущего состояния. Итог: одна кнопка «Сохранить черновик»
        // переводила опубликованный план в приватный черновик — он исчезал
        // из библиотеки и из поиска, а на дашборде помечался «черновик».
        // Учитель этого не видел: подтверждения публикации не было.
        //
        // Публичность меняется только явным действием «Сохранить».
        if (change.reason === "draft") {
          state = { ...state, visibility: current.visibility, is_draft: current.is_draft };
        }
      }
      if (!isBoundedPlan(state)) throw new Error("План слишком большой");
      const now = new Date(Math.max(Date.now(), current.updated_at.getTime() + 1));
      await snapshotAndTrim(db, session, current, "versionId" in change ? "restore" : change.reason, now);
      const updated = await plans.updateOne({ ...scope, updated_at: current.updated_at },
        { $set: { ...state, updated_at: now } }, { session });
      if (updated.matchedCount !== 1) throw new Error(PLAN_CONFLICT);
      return { id: oid.toHexString(), updated_at: now.toISOString() };
    });
  } finally { await session.endSession(); }
}

export async function deletePlanWithVersions(id: string, ownerId: string) {
  const oid = toObjectId(id);
  if (!oid) throw new Error("Некорректный id");
  const db = await getDb();
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const result = await db.collection<PlanDoc>(COL.plans).deleteOne({ _id: oid, owner_id: ownerId }, { session });
      if (result.deletedCount !== 1) throw new Error("План не найден");
      await db.collection(COL.planVersions).deleteMany({ plan_id: oid.toHexString(), owner_id: ownerId }, { session });
    });
  } finally { await session.endSession(); }
}

export async function getPlanHistory(id: string, ownerId: string) {
  const oid = toObjectId(id);
  if (!oid) return null;
  const db = await getDb();
  const current = await db.collection<PlanDoc>(COL.plans).findOne({ _id: oid, owner_id: ownerId });
  if (!current) return null;
  const docs = await db.collection<PlanVersionDoc>(COL.planVersions)
    .find({ plan_id: oid.toHexString(), owner_id: ownerId }).sort({ created_at: -1, _id: -1 }).limit(MAX_PLAN_VERSIONS).toArray();
  const versions: PlanVersionRow[] = docs.map(v => ({
    id: v._id.toHexString(), created_at: v.created_at.toISOString(), reason: v.reason,
    is_draft: v.snapshot.is_draft ?? false,
    plan: toPlanRow({ ...v.snapshot, _id: oid, owner_id: ownerId, created_at: current.created_at }),
  }));
  return { current: toPlanRow(current), versions };
}

export function planMutationError(error: unknown, fallback: string): string {
  const safe = [PLAN_CONFLICT, "План не найден", "Версия не найдена", "Некорректный id", "План слишком большой",
    "Предыдущая версия слишком большая для истории. Изменения не сохранены."];
  return error instanceof Error && safe.includes(error.message) ? error.message : fallback;
}
