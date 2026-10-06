import "server-only";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { COL, getDb, toObjectId } from "@/lib/mongo";

/**
 * Классы и группы учителя.
 *
 * Учитель ведёт несколько параллельных нагрузок: «5-А», «7-Б», кружок, секция.
 * Привязка плана к классу даёт группировку в дашборде, корректный подсчёт
 * нагрузки за четверть и возможность смотреть успеваемость по классу, а не
 * по всем классам сразу.
 */

export interface TeacherClassDoc {
  _id?: ObjectId;
  owner_id: string;
  /** Отображаемое название: «5-А», «7-Б», «Кружок робототехники». */
  name: string;
  /** Класс 1–11, если это параллель; null для кружков и секций. */
  grade: number | null;
  /** Учебный год, чтобы «5-А» этого года не смешивалась с прошлым. */
  year: number;
  created_at: Date;
  updated_at: Date;
}

export interface TeacherClass {
  id: string;
  name: string;
  grade: number | null;
  year: number;
  createdAt: string;
}

/** Лимит нагрузки, чтобы случайно не завёл 500 классов. */
const MAX_CLASSES = 40;

const classNameSchema = z.string().trim().min(1, "Укажите название").max(60);
const gradeSchema = z.coerce.number().int().min(1).max(11).nullable();

export const classInputSchema = z.object({
  name: classNameSchema,
  grade: gradeSchema.optional().default(null),
});

/** Текущий учебный год: учебный год в РК начинается 1 сентября. */
export function currentSchoolYear(now = new Date()): number {
  const month = now.getUTCMonth() + 1; // 1..12
  // До конца августа ещё идёт учебный год, начавшийся в прошлом календаре.
  return month >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

function toRow(doc: TeacherClassDoc): TeacherClass {
  return {
    id: doc._id!.toString(),
    name: doc.name,
    grade: doc.grade,
    year: doc.year,
    createdAt: doc.created_at.toISOString(),
  };
}

export async function listClasses(ownerId: string, year?: number): Promise<TeacherClass[]> {
  const db = await getDb();
  const filter: Record<string, unknown> = { owner_id: ownerId };
  if (year !== undefined) filter.year = year;
  const rows = await db
    .collection<TeacherClassDoc>(COL.classes)
    .find(filter)
    // Сначала параллели по классу, потом всё остальное — так список читается.
    .sort({ year: -1, grade: 1, name: 1 })
    .limit(MAX_CLASSES)
    .toArray();
  return rows.map(toRow);
}

/** Классы текущего учебного года — то, что показываем в конструкторе по умолчанию. */
export async function listCurrentClasses(ownerId: string): Promise<TeacherClass[]> {
  return listClasses(ownerId, currentSchoolYear());
}

export async function createClass(
  ownerId: string,
  input: { name: string; grade?: number | null },
): Promise<{ ok: true; class: TeacherClass } | { ok: false; error: string }> {
  const parsed = classInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте данные" };
  const db = await getDb();
  const count = await db.collection(COL.classes).countDocuments({ owner_id: ownerId });
  if (count >= MAX_CLASSES) {
    return { ok: false, error: `Можно завести не более ${MAX_CLASSES} классов и групп. Удалите лишние.` };
  }
  const now = new Date();
  try {
    const created = await db.collection<TeacherClassDoc>(COL.classes).insertOne({
      owner_id: ownerId,
      name: parsed.data.name,
      grade: parsed.data.grade ?? null,
      year: currentSchoolYear(),
      created_at: now,
      updated_at: now,
    });
    return {
      ok: true,
      class: { id: created.insertedId.toString(), name: parsed.data.name, grade: parsed.data.grade ?? null, year: currentSchoolYear(), createdAt: now.toISOString() },
    };
  } catch (e) {
    if ((e as { code?: number }).code === 11000) {
      return { ok: false, error: "Класс с таким названием уже есть." };
    }
    throw e;
  }
}

export async function renameClass(
  ownerId: string,
  classId: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const oid = toObjectId(classId);
  if (!oid) return { ok: false, error: "Класс не найден" };
  const parsed = classNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте название" };
  const db = await getDb();
  try {
    // owner_id в фильтре: чужой класс переименовать нельзя.
    const res = await db.collection(COL.classes).updateOne(
      { _id: oid, owner_id: ownerId },
      { $set: { name: parsed.data, updated_at: new Date() } },
    );
    if (res.matchedCount === 0) return { ok: false, error: "Класс не найден" };
    return { ok: true };
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return { ok: false, error: "Класс с таким названием уже есть." };
    throw e;
  }
}

/**
 * Удаление класса. Планы не удаляются — у них просто пропадает привязка,
 * иначе одно нажатие уничтожило бы работу за год.
 */
export async function deleteClass(ownerId: string, classId: string): Promise<{ ok: boolean; error?: string }> {
  const oid = toObjectId(classId);
  if (!oid) return { ok: false, error: "Класс не найден" };
  const db = await getDb();
  const res = await db.collection(COL.classes).deleteOne({ _id: oid, owner_id: ownerId });
  if (res.deletedCount === 0) return { ok: false, error: "Класс не найден" };
  await Promise.all([
    db.collection(COL.plans).updateMany({ owner_id: ownerId, class_id: classId }, { $unset: { class_id: "" } }),
    db.collection(COL.kits).updateMany({ owner_id: ownerId, class_id: classId }, { $unset: { class_id: "" } }),
  ]);
  return { ok: true };
}

/** Принадлежит ли класс владельцу — для защиты привязки в формах. */
export async function classBelongsTo(ownerId: string, classId: string | null | undefined): Promise<boolean> {
  if (!classId) return true; // привязка необязательна
  const oid = toObjectId(classId);
  if (!oid) return false;
  const db = await getDb();
  const doc = await db.collection(COL.classes).findOne({ _id: oid, owner_id: ownerId }, { projection: { _id: 1 } });
  return Boolean(doc);
}

/** Карта «id → название» для подписей в списках. */
export async function classNameMap(ownerId: string): Promise<Record<string, string>> {
  const rows = await listClasses(ownerId);
  return Object.fromEntries(rows.map((c) => [c.id, c.name]));
}
