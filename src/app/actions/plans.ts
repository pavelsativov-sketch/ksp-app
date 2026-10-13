"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, COL, toObjectId } from "@/lib/mongo";
import { getCurrentUser } from "@/lib/auth";
import { createLessonPlanSchema, lessonPlanMetaSchema } from "@/lib/validation/ksp";
import type { KspContent } from "@/lib/types/ksp";
import type { PlanDoc } from "@/lib/plans-repo";
import { deletePlanWithVersions, isBoundedPlan, planMutationError, updatePlanWithVersion, planState, PLAN_CONFLICT, PLAN_VERSION_SECTIONS, type PlanSection } from "@/lib/plan-versions";
import { reportPlan } from "@/lib/moderation";
import { classBelongsTo } from "@/lib/classes";

export interface SavePlanInput {
  id?: string;
  title: string;
  subject_id: string | null;
  grade: number;
  quarter: number | null;
  section: string | null;
  /** Привязка к классу/группе учителя; проверяется на принадлежность. */
  class_id?: string | null;
  visibility: "private" | "unlisted" | "public";
  language: "ru" | "kz";
  content: KspContent;
  /** Required for existing plans to reject stale editors. */
  expected_updated_at?: string;
}
export type SavePlanResult = { id: string; updated_at?: string } | { error: string; code?: "conflict" };
export type PlanConflictSnapshot = Omit<SavePlanInput, "expected_updated_at"> & { id: string; updated_at: string };

function saveActionError(error: unknown, fallback: string): SavePlanResult {
  const message = planMutationError(error, fallback);
  return error instanceof Error && error.message === PLAN_CONFLICT
    ? { error: message, code: "conflict" }
    : { error: message };
}

function refreshPlan(id: string) {
  revalidatePath(`/plans/${id}`);
  revalidatePath(`/plans/${id}/edit`);
  revalidatePath(`/plans/${id}/history`);
  revalidatePath("/dashboard");
}

export async function savePlanAction(input: SavePlanInput): Promise<SavePlanResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Требуется вход" };
    if (!isBoundedPlan(input)) return { error: "План слишком большой" };
    const parsed = createLessonPlanSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues.map(i => i.message).join(", ") };
    // Класс должен принадлежать учителю: иначе можно было бы привязать
    // план к чужому наименованию и выдумать класс, которого нет.
    if (!(await classBelongsTo(user.id, parsed.data.class_id))) {
      return { error: "Выбранный класс не найден. Обновите страницу." };
    }
    const state = planState({ ...parsed.data, is_draft: false });
    if (input.id) {
      const result = await updatePlanWithVersion(input.id, user.id, input.expected_updated_at, { state, reason: "save" });
      refreshPlan(result.id);
      return result;
    }
    const now = new Date();
    const db = await getDb();
    const result = await db.collection<PlanDoc>(COL.plans).insertOne({
      ...state, owner_id: user.id, created_at: now, updated_at: now,
    });
    revalidatePath("/dashboard");
    return { id: result.insertedId.toString(), updated_at: now.toISOString() };
  } catch (error) {
    return saveActionError(error, "Не удалось сохранить: база данных недоступна");
  }
}

/** Draft content may be incomplete, but metadata and total byte size remain bounded. */
export async function saveDraftAction(input: SavePlanInput): Promise<SavePlanResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Требуется вход" };
    if (!isBoundedPlan(input)) return { error: "Черновик слишком большой" };
    const title = typeof input.title === "string" ? input.title.trim() || "(без названия)" : "(без названия)";
    const parsed = lessonPlanMetaSchema.safeParse({ ...input, title, visibility: "private" });
    if (!parsed.success || !input.content || typeof input.content !== "object" || Array.isArray(input.content)) {
      return { error: "Некорректные данные черновика" };
    }
    if (!(await classBelongsTo(user.id, parsed.data.class_id))) {
      return { error: "Выбранный класс не найден. Обновите страницу." };
    }
    const state = planState({ ...parsed.data, content: input.content, is_draft: true });
    if (input.id) {
      const result = await updatePlanWithVersion(input.id, user.id, input.expected_updated_at, { state, reason: "draft" });
      refreshPlan(result.id);
      return result;
    }
    const db = await getDb();
    const now = new Date();
    const result = await db.collection<PlanDoc>(COL.plans).insertOne({
      ...state, owner_id: user.id, created_at: now, updated_at: now,
    });
    revalidatePath("/dashboard");
    return { id: result.insertedId.toString(), updated_at: now.toISOString() };
  } catch (error) {
    return saveActionError(error, "Не удалось сохранить черновик: база данных недоступна");
  }
}

/** Returns the latest full plan only to its authenticated owner after a revision conflict. */
export async function getPlanConflictSnapshotAction(id: string): Promise<PlanConflictSnapshot | { error: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Требуется вход" };
    const oid = toObjectId(id);
    if (!oid) return { error: "Некорректный id" };
    const db = await getDb();
    const current = await db.collection<PlanDoc>(COL.plans).findOne({ _id: oid, owner_id: user.id });
    if (!current) return { error: "План не найден" };
    return {
      id: oid.toHexString(),
      title: current.title,
      subject_id: current.subject_id,
      grade: current.grade,
      quarter: current.quarter,
      section: current.section ?? null,
      class_id: current.class_id ?? null,
      visibility: current.visibility,
      language: current.language,
      content: current.content,
      updated_at: current.updated_at.toISOString(),
    };
  } catch {
    return { error: "Не удалось загрузить актуальную версию" };
  }
}

export async function deletePlanAction(id: string) {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Требуется вход" };
    await deletePlanWithVersions(id, user.id);
    refreshPlan(id);
  } catch (error) {
    return { error: planMutationError(error, "Не удалось удалить план") };
  }
  redirect("/dashboard");
}

export async function duplicatePlanAction(id: string) {
  let newId: string;
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Требуется вход" };
    const oid = toObjectId(id);
    if (!oid) return { error: "Некорректный id" };
    const db = await getDb();
    const src = await db.collection<PlanDoc>(COL.plans).findOne({
      _id: oid, $or: [{ owner_id: user.id }, { visibility: "public" }],
    });
    if (!src) return { error: "План не найден" };
    const suffix = " (копия)";
    const state = { ...planState(src), title: `${src.title.slice(0, 5000 - suffix.length)}${suffix}`, visibility: "private" as const };
    if (!isBoundedPlan(state)) return { error: "План слишком большой" };
    const now = new Date();
    const result = await db.collection<PlanDoc>(COL.plans).insertOne({
      ...state, owner_id: user.id, created_at: now, updated_at: now,
    });
    newId = result.insertedId.toString();
    revalidatePath("/dashboard");
  } catch {
    return { error: "Не удалось создать копию плана" };
  }
  redirect(`/plans/${newId}/edit`);
}

export async function restorePlanVersionAction(input: {
  plan_id: string;
  version_id: string;
  expected_updated_at?: string;
  sections?: PlanSection[];
}): Promise<SavePlanResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Требуется вход" };
    if (input.sections !== undefined) {
      const valid = Array.isArray(input.sections)
        && input.sections.length > 0
        && input.sections.length <= PLAN_VERSION_SECTIONS.length
        && new Set(input.sections).size === input.sections.length
        && input.sections.every((section) => (PLAN_VERSION_SECTIONS as readonly string[]).includes(section));
      if (!valid) return { error: "Выберите один или несколько допустимых разделов для восстановления" };
    }
    const result = await updatePlanWithVersion(input.plan_id, user.id, input.expected_updated_at, {
      versionId: input.version_id,
      ...(input.sections === undefined ? {} : { sections: input.sections }),
    });
    refreshPlan(result.id);
    return result;
  } catch (error) {
    return { error: planMutationError(error, "Не удалось восстановить версию: база данных недоступна") };
  }
}

/** Жалоба на чужой публичный план — на модерацию. */
export async function reportPlanAction(input: {
  planId: string;
  reason: string;
  details?: string;
}): Promise<{ ok: true } | { error: string }> {
  const result = await reportPlan(input);
  if (result.ok) {
    revalidatePath(`/plans/${input.planId}`);
    return { ok: true };
  }
  return { error: result.error };
}
