import "server-only";
import { COL, getDb } from "@/lib/mongo";
import type { PlanDoc } from "@/lib/plans-repo";

export interface TrashedPlanRow {
  id: string;
  title: string;
  grade: number | null;
  topic: string | null;
  deletedAt: string;
}

/**
 * Список удалённых планов конкретного пользователя (только для серверного рендера).
 * Вынесено из `"use server"` файла `actions/plans.ts`, чтобы эта функция не могла
 * вызываться по HTTP как публичный Server Action с произвольным `userId`.
 */
export async function listTrashedPlans(userId: string, limit = 20): Promise<TrashedPlanRow[]> {
  if (!userId || !/^[0-9a-f]{24}$/i.test(userId)) return [];
  const safeLimit = Math.min(50, Math.max(1, Math.trunc(limit) || 20));
  const db = await getDb();
  const docs = await db
    .collection(COL.planTrash)
    .find({ owner_id: userId })
    .sort({ deleted_at: -1 })
    .limit(safeLimit)
    .toArray();
  return docs.map((d) => ({
    id: String(d._id),
    title: String((d.original as PlanDoc | undefined)?.title ?? "(без названия)"),
    grade: Number.isFinite((d.original as PlanDoc | undefined)?.grade)
      ? (d.original as PlanDoc).grade
      : null,
    topic:
      typeof (d.original as PlanDoc | undefined)?.content?.topic === "string"
        ? (d.original as PlanDoc).content.topic
        : null,
    deletedAt: d.deleted_at instanceof Date ? d.deleted_at.toISOString() : new Date().toISOString(),
  }));
}
