import "server-only";
import { createHash } from "crypto";
import type { AiKspPayload } from "./prompt";
import type { RagRunInfo } from "@/lib/rag/metadata";

/**
 * In-memory кэш сгенерированных КСП.
 *
 * Идентичные запросы (тот же класс/предмет/тема/цели/язык/контекст) раньше
 * каждый раз генерировались заново и списывали квоту. Кэш отдаёт повторный
 * результат без обращения к провайдерам и без расхода квоты.
 *
 * Кэш живёт в памяти инстанса и сбрасывается при рестарте — это осознанный
 * компромисс: он дешёвый и не требует отдельного хранилища.
 */

const CACHE_MAX_ENTRIES = 50;
const CACHE_TTL_MS = 6 * 3600 * 1000; // 6 часов

interface CacheEntry {
  payload: AiKspPayload;
  model: string;
  rag: RagRunInfo | null;
  storedAt: number;
}

const store = new Map<string, CacheEntry>();

export interface GenerationCacheInput {
  grade: number;
  subject: string;
  topic: string;
  learningObjectives: string[];
  language: "ru" | "kz";
  schoolProfile?: string;
  section?: string | null;
  previousTopic?: string | null;
  previousHomeworkIncluded: boolean;
  textbookId?: string | null;
  armanpvId?: string | null;
  refine: boolean;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function generationCacheKey(input: GenerationCacheInput): string {
  const normalized = {
    grade: input.grade,
    subject: input.subject.trim().toLowerCase(),
    topic: input.topic.trim().toLowerCase(),
    learningObjectives: [...input.learningObjectives].map((s) => s.trim().toLowerCase()).sort(),
    language: input.language,
    schoolProfile: input.schoolProfile ?? null,
    section: input.section?.trim().toLowerCase() ?? null,
    previousTopic: input.previousTopic?.trim().toLowerCase() ?? null,
    previousHomeworkIncluded: Boolean(input.previousHomeworkIncluded),
    textbookId: input.textbookId ?? null,
    armanpvId: input.armanpvId ?? null,
    refine: Boolean(input.refine),
  };
  return createHash("sha256").update(stableStringify(normalized)).digest("hex");
}

function pruneIfNeeded(): void {
  if (store.size <= CACHE_MAX_ENTRIES) return;
  const now = Date.now();
  const expiredKeys: string[] = [];
  for (const [key, entry] of store) {
    if (now - entry.storedAt > CACHE_TTL_MS) expiredKeys.push(key);
  }
  for (const key of expiredKeys) store.delete(key);
  // Если TTL-чистка не освободила место — выкидываем самые старые.
  while (store.size > CACHE_MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [key, entry] of store) {
      if (entry.storedAt < oldestAt) {
        oldestAt = entry.storedAt;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    store.delete(oldestKey);
  }
}

export function getCachedGeneration(key: string): { payload: AiKspPayload; model: string; rag: RagRunInfo | null } | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > CACHE_TTL_MS) {
    store.delete(key);
    return null;
  }
  return { payload: entry.payload, model: entry.model, rag: entry.rag };
}

export function setCachedGeneration(
  key: string,
  value: { payload: AiKspPayload; model: string; rag: RagRunInfo | null },
): void {
  pruneIfNeeded();
  store.set(key, { ...value, storedAt: Date.now() });
}
