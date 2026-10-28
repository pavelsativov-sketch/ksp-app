import "server-only";
import { createHash } from "crypto";
import { ObjectId } from "mongodb";
import { getDb, COL, isMongoConfigured } from "@/lib/mongo";
import { getUserSchools } from "@/lib/school";
import type { RagRunInfo } from "@/lib/rag/metadata";

/**
 * История AI-запросов: server-side лог в ai_events.
 *
 * TTL 90 дней уже задан индексом ai_events_ttl. Политика удаления
 * дополняется явным фильтром createdAt >= 90d при чтении и хелпером
 * purgeExpiredAiHistory для ручной очистки (например, по крону).
 *
 * Доступ: только владелец записи или завуч/директор той же школы,
 * где состоит владелец (проверка canViewAiHistory).
 */

export const AI_HISTORY_SCHEMA_VERSION = "1";
export const AI_HISTORY_TTL_DAYS = 90;

/** Канонические параметры для хеша — без чувствительного текста ДЗ. */
export interface AiHistoryParamsInput {
  grade: number;
  subject: string;
  topic: string;
  learningObjectives: string[];
  language: "ru" | "kz";
  schoolProfile?: string;
  section?: string | null;
  previousTopic?: string | null;
  /** Только факт наличия ДЗ, не текст. */
  previousHomeworkIncluded: boolean;
  textbookId?: string | null;
  armanpvId?: string | null;
  promptVersion?: string;
}

export interface AiHistoryDoc {
  _id?: ObjectId;
  user_id: string;
  task: "generation" | "enhance";
  model: string;
  schema_version: string;
  source_ids: string[];
  paramsHash: string;
  /** Безопасные параметры (без текста ДЗ). */
  params: AiHistoryParamsInput;
  rag: RagRunInfo;
  createdAt: Date;
  /** Совместимость с TTL-индексом по createdAt и телеметрия-тасками. */
  created_at?: Date;
}

export interface AiHistoryPublic {
  id: string;
  user_id: string;
  task: string;
  model: string;
  schema_version: string;
  source_ids: string[];
  paramsHash: string;
  params: AiHistoryParamsInput;
  rag: RagRunInfo;
  createdAt: string;
}

/** Стабильная сериализация: сортировка ключей. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function computeParamsHash(input: AiHistoryParamsInput): string {
  const normalized = {
    grade: input.grade,
    language: input.language,
    learningObjectives: [...(input.learningObjectives ?? [])].sort(),
    previousHomeworkIncluded: Boolean(input.previousHomeworkIncluded),
    promptVersion: input.promptVersion ?? AI_HISTORY_SCHEMA_VERSION,
    schoolProfile: input.schoolProfile ?? null,
    section: input.section ?? null,
    subject: input.subject.trim(),
    textbookId: input.textbookId ?? null,
    armanpvId: input.armanpvId ?? null,
    topic: input.topic.trim(),
    previousTopic: input.previousTopic ?? null,
  };
  return createHash("sha256").update(stableStringify(normalized)).digest("hex").slice(0, 32);
}

export function buildHistoryParams(raw: {
  grade: number;
  subject: string;
  topic: string;
  learningObjectives?: string[];
  language: "ru" | "kz";
  schoolProfile?: string;
  section?: string;
  previousTopic?: string;
  previousHomework?: string;
  textbookId?: string | null;
  armanpvId?: string | null;
}): AiHistoryParamsInput {
  return {
    grade: raw.grade,
    subject: raw.subject,
    topic: raw.topic,
    learningObjectives: raw.learningObjectives ?? [],
    language: raw.language,
    schoolProfile: raw.schoolProfile,
    section: raw.section ?? null,
    previousTopic: raw.previousTopic ?? null,
    previousHomeworkIncluded: Boolean(raw.previousHomework?.trim()),
    textbookId: raw.textbookId ?? null,
    armanpvId: raw.armanpvId ?? null,
    promptVersion: "ksp-generation-v1",
  };
}

export async function logAiHistory(entry: Omit<AiHistoryDoc, "_id" | "createdAt" | "created_at">): Promise<void> {
  if (!isMongoConfigured()) return;
  // fire-and-forget — не ломаем генерацию
  void (async () => {
    try {
      const db = await getDb();
      const now = new Date();
      await db.collection(COL.aiEvents).insertOne({
        ...entry,
        kind: "history",
        createdAt: now,
        created_at: now,
      });
    } catch {
      // история некритична
    }
  })();
}

/** Проверка доступа: владелец или завуч/директор общей школы. */
export async function canViewAiHistory(requesterId: string, targetUserId: string): Promise<boolean> {
  if (requesterId === targetUserId) return true;
  try {
    const [requesterSchools, targetSchools] = await Promise.all([
      getUserSchools(requesterId),
      getUserSchools(targetUserId),
    ]);
    const targetSchoolIds = new Set(targetSchools.map((s) => s._id?.toString()).filter(Boolean) as string[]);
    if (targetSchoolIds.size === 0) return false;
    const db = await getDb();
    // Ищем членство запрашивающего в любой школе цели с ролью deputy/director
    const memberships = await db
      .collection(COL.schoolMembers)
      .find({ user_id: requesterId, school_id: { $in: [...targetSchoolIds] } })
      .toArray();
    return memberships.some((m) => (m as { role?: string }).role === "deputy" || (m as { role?: string }).role === "director");
  } catch {
    return false;
  }
}

export function retentionCutoff(): Date {
  return new Date(Date.now() - AI_HISTORY_TTL_DAYS * 24 * 3600 * 1000);
}

/** Явная политика удаления просроченных записей (дополняет TTL-индекс). */
export async function purgeExpiredAiHistory(): Promise<number> {
  if (!isMongoConfigured()) return 0;
  const db = await getDb();
  const res = await db.collection(COL.aiEvents).deleteMany({
    // history docs имеют schema_version, quota-slots — нет; чистим только историю/телеметрию
    createdAt: { $lt: retentionCutoff() },
    // Не трогаем слоты квоты (у них есть seq)
    seq: { $exists: false },
  });
  return res.deletedCount ?? 0;
}

export function toPublicHistory(doc: AiHistoryDoc & { _id: ObjectId }): AiHistoryPublic {
  return {
    id: doc._id.toString(),
    user_id: doc.user_id,
    task: doc.task,
    model: doc.model,
    schema_version: doc.schema_version,
    source_ids: doc.source_ids,
    paramsHash: doc.paramsHash,
    params: doc.params,
    rag: doc.rag,
    createdAt: (doc.createdAt ?? doc.created_at ?? new Date()).toISOString(),
  };
}
