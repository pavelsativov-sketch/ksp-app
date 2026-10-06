/**
 * Rate limiter: MongoDB-backed при настроенном MONGODB_URI (работает на
 * multi-instance/serverless), иначе in-memory fallback для dev/demo.
 */

import { getDb, COL, isMongoConfigured } from "@/lib/mongo";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitDoc {
  _id: string;
  count: number;
  resetAt: Date;
  expiresAt: Date;
}

const memStore = new Map<string, RateLimitEntry>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

/** true — использован персистентный (Mongo) лимитер, а не локальный fallback. */
export async function isDistributedLimiterActive(): Promise<boolean> {
  if (!isMongoConfigured()) return false;
  try {
    await getDb();
    return true;
  } catch {
    return false;
  }
}

/**
 * IP клиента для ключа ограничения частоты.
 *
 * За Cloudflare честен только `cf-connecting-ip`: edge перезаписывает его сам,
 * тогда как x-real-ip / x-forwarded-for клиент может подделать и обойти
 * лимиты ротацией заголовков. Вне CF доверенный заголовок включается явно
 * (например, за nginx: TRUSTED_IP_HEADER=x-real-ip); без него все клиенты
 * попадают в общий бакет "unknown" — лимиты строже, а не слабее (fail-closed).
 */
export function clientIp(request: Request): string {
  return clientIpFromHeaders(request.headers);
}

/**
 * Тот же разбор, но для Server Action, где нет объекта `Request`, а есть
 * только `Headers` из `next/headers`.
 *
 * Дублировать разбор в экшенах было нельзя: расхождение между копиями
 * означало, что часть лимитов доверяла `x-forwarded-for` напрямую (его
 * подделывает клиент), а часть — нет, и лимит логина обходился простой
 * ротацией заголовка.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const trustedHeader = process.env.TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (trustedHeader) {
    const value = headers.get(trustedHeader)?.split(",")[0]?.trim();
    if (value) return value;
  }
  return "unknown";
}

export async function checkRateLimitAsync(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (!isMongoConfigured()) return checkRateLimit(key, limit, windowMs);
  const now = Date.now();
  const nowDate = new Date(now);
  const resetAt = new Date(now + windowMs);
  const expiresAt = new Date(now + windowMs + 60_000);
  try {
    const col = (await getDb()).collection<RateLimitDoc>(COL.rateLimits);
    // Атомарный upsert: при истёкшем окне (или на первой вставке) счётчик
    // сбрасывается в 1, иначе инкрементируется. Без гонок между инстансами.
    const doc = await col.findOneAndUpdate(
      { _id: key },
      [
        {
          $set: {
            count: {
              $cond: [
                { $gt: ["$resetAt", nowDate] },
                { $add: [{ $ifNull: ["$count", 0] }, 1] },
                1,
              ],
            },
            resetAt: { $cond: [{ $gt: ["$resetAt", nowDate] }, "$resetAt", resetAt] },
            expiresAt,
          },
        },
      ],
      { upsert: true, returnDocument: "after" },
    );
    const count = doc?.count ?? 1;
    const effectiveResetAt = (doc?.resetAt ?? resetAt).getTime();
    return {
      ok: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: effectiveResetAt,
    };
  } catch (error) {
    console.error(
      `[rate-limit] Mongo-лимитер недоступен, используется локальный счётчик:`,
      error instanceof Error ? error.message : error,
    );
    return checkRateLimit(key, limit, windowMs);
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  let entry = memStore.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    memStore.set(key, entry);
  }
  entry.count++;
  const remaining = Math.max(0, limit - entry.count);
  return {
    ok: entry.count <= limit,
    remaining,
    resetAt: entry.resetAt,
  };
}
