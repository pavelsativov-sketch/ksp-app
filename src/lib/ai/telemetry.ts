/**
 * Телеметрия AI-вызовов: пишем каждый запрос к провайдерам в MongoDB
 * (fire-and-forget — телеметрия не должна ломать основной поток).
 *
 * Что даёт: реальные статистики провайдеров/моделей, время ответа, ошибки,
 * объём токенов — вместо ручного бенчмарка вслепую.
 */

import "server-only";
import { getDb, COL, isMongoConfigured } from "@/lib/mongo";

export interface AiEventEntry {
  task: string;
  provider: string;
  model: string;
  duration_ms: number;
  ok: boolean;
  error?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  created_at: Date;
}

export function logAiEvent(entry: Omit<AiEventEntry, "created_at">): void {
  if (!isMongoConfigured()) return;
  void (async () => {
    try {
      const db = await getDb();
      await db.collection(COL.aiEvents).insertOne({ ...entry, createdAt: new Date() });
    } catch {
      // Телеметрия необязательна: молча пропускаем любой сбой.
    }
  })();
}

export interface AiFeedbackEntry {
  user_id: string;
  kind: "generate" | "enhance";
  section?: string | null;
  rating: "up" | "down";
  note?: string | null;
  created_at: Date;
}

export function logAiFeedback(entry: Omit<AiFeedbackEntry, "created_at">): void {
  if (!isMongoConfigured()) return;
  void (async () => {
    try {
      const db = await getDb();
      await db.collection(COL.aiEvents).insertOne({ ...entry, createdAt: new Date() });
    } catch {
      // игнорируем
    }
  })();
}