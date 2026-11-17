import { COL, getDb } from "@/lib/mongo";
import { getPlanById } from "@/lib/plans-repo";
import type { MaterialKind, StageKey } from "@/lib/types/ksp";
import type { WorksheetTask } from "@/lib/handouts/types";

/**
 * Материалы урока на сервере (docs/lesson-kit-design.md, шаг 1). Раньше лист, ООП,
 * карточки и презентация жили только в браузере учителя и терялись при смене
 * устройства; КСП о них не знал. Один материал каждого вида на урок.
 */
export interface PlanMaterialDoc {
  _id: string;
  plan_id: string;
  owner_id: string;
  kind: MaterialKind;
  stage: StageKey;
  title: string;
  payload: unknown;
  created_at: Date;
  updated_at: Date;
}

export interface PlanMaterialSummary {
  kind: MaterialKind;
  stage: StageKey;
  title: string;
  updatedAt: string;
}

/** Ключ документа: один материал вида на урок, повторная генерация заменяет его. */
export const materialId = (planId: string, kind: MaterialKind) => `${planId}:${kind}`;

/** Документ Mongo не больше 16 МБ; лист с картинками — несколько мегабайт. */
const MAX_PAYLOAD_BYTES = 12 * 1024 * 1024;

async function collection() {
  return (await getDb()).collection<PlanMaterialDoc>(COL.planMaterials);
}

export async function savePlanMaterial(input: { planId: string; ownerId: string; kind: MaterialKind; stage: StageKey; title: string; payload: unknown }): Promise<void> {
  const size = Buffer.byteLength(JSON.stringify(input.payload ?? null));
  if (size > MAX_PAYLOAD_BYTES) throw new Error(`Материал слишком большой для сохранения (${Math.round(size / 1024 / 1024)} МБ)`);
  const now = new Date();
  await (await collection()).updateOne(
    { _id: materialId(input.planId, input.kind), owner_id: input.ownerId },
    {
      $set: { plan_id: input.planId, owner_id: input.ownerId, kind: input.kind, stage: input.stage, title: input.title, payload: input.payload, updated_at: now },
      $setOnInsert: { created_at: now },
    },
    { upsert: true },
  );
}

const PLAN_ID = /^[0-9a-f]{24}$/i;

/**
 * Сохраняет созданный материал в урок, если урок принадлежит пользователю. Ошибка
 * сохранения не ломает генерацию: учитель всё равно получает материал в ответе.
 */
export async function saveToOwnedPlan(input: { planId?: string; ownerId: string; kind: MaterialKind; stage?: StageKey; title: string; payload: unknown }): Promise<boolean> {
  if (!input.planId || !PLAN_ID.test(input.planId)) return false;
  try {
    const plan = await getPlanById(input.planId);
    if (!plan || plan.owner_id !== input.ownerId) return false;
    await savePlanMaterial({ ...input, planId: input.planId, stage: input.stage ?? "middle" });
    return true;
  } catch (error) {
    console.error("Plan material save failed", { planId: input.planId, kind: input.kind, error });
    return false;
  }
}

export async function listPlanMaterials(planId: string, ownerId: string): Promise<PlanMaterialSummary[]> {
  const docs = await (await collection())
    .find({ plan_id: planId, owner_id: ownerId }, { projection: { payload: 0 } })
    .sort({ updated_at: -1 })
    .toArray();
  return docs.map((doc) => ({ kind: doc.kind, stage: doc.stage, title: doc.title, updatedAt: doc.updated_at.toISOString() }));
}

export async function getPlanMaterial(planId: string, ownerId: string, kind: MaterialKind): Promise<PlanMaterialDoc | null> {
  return (await collection()).findOne({ _id: materialId(planId, kind), owner_id: ownerId });
}

/** Задания рабочего листа без картинок и Word-файла: для баллов в «Оценивании». */
export async function getWorksheetTasks(planId: string, ownerId: string): Promise<{ stage: StageKey; tasks: WorksheetTask[] } | null> {
  const doc = await (await collection()).findOne(
    { _id: materialId(planId, "worksheet"), owner_id: ownerId },
    { projection: { stage: 1, "payload.handout.tasks.descriptor": 1, "payload.handout.tasks.criterion": 1, "payload.handout.tasks.points": 1 } },
  );
  const tasks = (doc?.payload as { handout?: { tasks?: WorksheetTask[] } } | undefined)?.handout?.tasks;
  return doc && Array.isArray(tasks) ? { stage: doc.stage, tasks } : null;
}

export async function deletePlanMaterial(planId: string, ownerId: string, kind: MaterialKind): Promise<boolean> {
  const result = await (await collection()).deleteOne({ _id: materialId(planId, kind), owner_id: ownerId });
  return result.deletedCount > 0;
}
