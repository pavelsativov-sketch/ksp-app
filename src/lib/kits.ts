import "server-only";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { COL, getDb, toObjectId } from "@/lib/mongo";
import type { Handout } from "@/lib/handouts/types";

/**
 * Сохранённые комплекты материалов.
 *
 * Рабочий лист, памятки и кроссворд каждый раз генерируются заново и тратят
 * квоту AI. Учитель, который нашёл удачную комбинацию, сохраняет её целиком
 * и переиспользует в следующем году или на параллели — без новой генерации.
 */
export interface KitDoc {
  _id?: ObjectId;
  owner_id: string;
  title: string;
  topic: string;
  subject_id: string | null;
  grade: number | null;
  class_id: string | null;
  /** Собранные материалы. Состав может расширяться: сюда же ляжет презентация. */
  handouts: Handout[];
  /** Раздача «памятки после листа» — если комплект собран из двух кнопок. */
  extra: Handout | null;
  created_at: Date;
  updated_at: Date;
}

export interface KitRow {
  id: string;
  title: string;
  topic: string;
  subject_id: string | null;
  grade: number | null;
  class_id: string | null;
  kinds: Array<"worksheet" | "flashcards" | "crossword">;
  createdAt: string;
}

const MAX_KITS = 100;
const kitTitleSchema = z.string().trim().min(1, "Укажите название").max(200);

/** Размер одного материала в комплекте: docx с картинками бывает крупным. */
const MAX_KIT_BYTES = 3 * 1024 * 1024;
const MAX_ITEMS = 4;

export const kitTitleInputSchema = z.object({ title: kitTitleSchema });

export const kitSaveInputSchema = z.object({
  title: kitTitleSchema,
  topic: z.string().trim().max(300).default(""),
  subject_id: z.string().regex(/^[0-9a-f]{24}$/i).nullable().default(null),
  grade: z.coerce.number().int().min(1).max(11).nullable().default(null),
  class_id: z.string().regex(/^[0-9a-f]{24}$/i).nullable().default(null),
  handouts: z.array(z.unknown()).min(1).max(MAX_ITEMS),
  extra: z.unknown().nullable().default(null),
});

/** Вход серверной функции: необязательные поля подставятся `.default()`. */
export type KitSaveInput = z.input<typeof kitSaveInputSchema>;

function toRow(doc: KitDoc): KitRow {
  const handouts = doc.handouts ?? [];
  const all = doc.extra ? [...handouts, doc.extra] : handouts;
  return {
    id: doc._id!.toString(),
    title: doc.title,
    topic: doc.topic,
    subject_id: doc.subject_id,
    grade: doc.grade,
    class_id: doc.class_id,
    kinds: all.map((h) => h.kind),
    createdAt: doc.created_at.toISOString(),
  };
}

export async function listKits(ownerId: string, limit = 60): Promise<KitRow[]> {
  const db = await getDb();
  const rows = await db
    .collection<KitDoc>(COL.kits)
    .find({ owner_id: ownerId })
    .sort({ updated_at: -1 })
    .limit(Math.min(MAX_KITS, Math.max(1, limit)))
    .toArray();
  return rows.map(toRow);
}

/** Полный комплект для скачивания — с материалами, а не только метаданными. */
export async function getKit(ownerId: string, kitId: string): Promise<KitDoc | null> {
  const oid = toObjectId(kitId);
  if (!oid) return null;
  const db = await getDb();
  return db.collection<KitDoc>(COL.kits).findOne({ _id: oid, owner_id: ownerId });
}

export async function saveKit(
  ownerId: string,
  input: KitSaveInput,
): Promise<{ ok: true; kit: KitRow } | { ok: false; error: string }> {
  const parsed = kitSaveInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте данные" };

  // Материалы приходят из браузера и могут весить мегабайты (картинки в base64).
  if (Buffer.byteLength(JSON.stringify(parsed.data), "utf8") > MAX_KIT_BYTES) {
    return { ok: false, error: "Комплект слишком большой (больше 3 МБ). Сохраните без картинок." };
  }

  const db = await getDb();
  const count = await db.collection(COL.kits).countDocuments({ owner_id: ownerId });
  if (count >= MAX_KITS) {
    return { ok: false, error: `Можно хранить не более ${MAX_KITS} комплектов. Удалите лишние.` };
  }
  const now = new Date();
  const created = await db.collection<KitDoc>(COL.kits).insertOne({
    owner_id: ownerId,
    title: parsed.data.title,
    topic: parsed.data.topic,
    subject_id: parsed.data.subject_id,
    grade: parsed.data.grade,
    class_id: parsed.data.class_id,
    handouts: parsed.data.handouts as Handout[],
    extra: (parsed.data.extra as Handout | null) ?? null,
    created_at: now,
    updated_at: now,
  });
  return {
    ok: true,
    kit: {
      id: created.insertedId.toString(),
      title: parsed.data.title,
      topic: parsed.data.topic,
      subject_id: parsed.data.subject_id,
      grade: parsed.data.grade,
      class_id: parsed.data.class_id,
      kinds: [...parsed.data.handouts, parsed.data.extra].filter(Boolean).map((h) => (h as Handout).kind),
      createdAt: now.toISOString(),
    },
  };
}

export async function deleteKit(ownerId: string, kitId: string): Promise<{ ok: boolean; error?: string }> {
  const oid = toObjectId(kitId);
  if (!oid) return { ok: false, error: "Комплект не найден" };
  const db = await getDb();
  // owner_id в фильтре: чужой комплект удалить нельзя.
  const res = await db.collection(COL.kits).deleteOne({ _id: oid, owner_id: ownerId });
  if (res.deletedCount === 0) return { ok: false, error: "Комплект не найден" };
  return { ok: true };
}
