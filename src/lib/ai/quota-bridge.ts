import "server-only";
import { NextResponse } from "next/server";
import { reserveQuotaOrResponse, type QuotaKind } from "@/lib/billing/quota";
import { HandoutQuotaError } from "@/lib/billing/quota-error";

/**
 * Мост между HTTP-роутами и квотами тарифа.
 *
 * Раньше квота резервировалась только в /api/ai/generate, а остальные семь
 * AI-маршрутов (улучшение секций, задания, раздаточные материалы) были
 * ограничены лишь rate-limit — то есть тариф обходился прямым вызовом API.
 * Здесь один механизм на все точки входа.
 */

/** Зарезервировать слот и вернуть его в квоте при ошибке. */
export async function withQuota<T>(
  user: { id: string },
  kind: QuotaKind,
  fn: (reservation: { remaining: number | null; finalize: (ok: boolean) => Promise<void> }) => Promise<T>,
): Promise<{ ok: true; value: T; remaining: number | null } | { ok: false; response: NextResponse }> {
  const quota = await reserveQuotaOrResponse(user, kind);
  if (!quota.ok) return quota;
  try {
    const value = await fn(quota.reservation);
    return { ok: true, value, remaining: quota.reservation.remaining };
  } catch (error) {
    await quota.reservation.finalize(false).catch(() => {});
    throw error;
  }
}

export interface SlotResult {
  ok: boolean;
  finalize?(success: boolean): Promise<void>;
}

/**
 * Контекст квоты для generateHandout: резервирует слоты под текст и картинки.
 *
 * Отказ по квоте возвращается как { ok: false }, а не бросается: для текста
 * generateHandout превращает это в HandoutQuotaError, для картинок — просто
 * останавливает набор иллюстраций (материал остаётся пригодным).
 */
export function handoutQuota(userId: string) {
  return {
    reserve: async (kind: "generation" | "image"): Promise<SlotResult> => {
      const quota = await reserveQuotaOrResponse({ id: userId }, kind);
      if (!quota.ok) return { ok: false };
      return { ok: true, finalize: quota.reservation.finalize };
    },
  };
}

/** Единый HTTP-ответ на отказ по квоте из любого слоя. */
export function quotaErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof HandoutQuotaError) {
    return NextResponse.json(
      { error: "Лимит AI-операций на этот месяц исчерпан. Подключите Pro или дождитесь следующего месяца.", code: "ASSIST_QUOTA_EXCEEDED" },
      { status: 429 },
    );
  }
  return null;
}
