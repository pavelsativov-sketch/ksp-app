import "server-only";
import { NextResponse } from "next/server";
import { COL, getDb, toObjectId } from "@/lib/mongo";
import { effectivePlan, PLANS, type Plan, type PlanLimits, type UserBillingFields } from "./plans";

export interface UserPlanUsage {
  plan: Plan;
  limits: Readonly<PlanLimits>;
  expiresAt: Date | null;
  kspUsedThisMonth: number;
  kspRemaining: number | null;
  assistUsedThisMonth: number;
  assistRemaining: number | null;
  imagesUsedThisMonth: number;
  imagesRemaining: number | null;
}

export function utcMonthWindow(now = new Date()): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

export async function getPlanForUser(userId: string): Promise<UserPlanUsage> {
  const id = toObjectId(userId);
  if (!id) throw new Error("Invalid billing user");
  const db = await getDb();
  const now = new Date();
  const { start, end } = utcMonthWindow(now);
  const monthFilter = { user_id: userId, createdAt: { $gte: start, $lt: end } };
  const user = await db.collection<UserBillingFields>(COL.users).findOne({ _id: id });
  if (!user) throw new Error("Billing user not found");
  // Учитываем только слоты квоты (kind: "slot"): история AI, телеметрия
  // и фидбек пишутся в ту же коллекцию и не должны считаться расходом.
  const events = await db.collection(COL.aiEvents).aggregate([
    { $match: { ...monthFilter, kind: "slot" } },
    {
      $group: {
        _id: "$task",
        count: { $sum: 1 },
      },
    },
  ]).toArray();
  const usageMap = Object.fromEntries(events.map((e) => [e._id, e.count]));
  const used = usageMap["generation"] ?? 0;
  const assistUsed = usageMap["assist"] ?? 0;
  const imagesUsed = usageMap["image"] ?? 0;
  const plan = effectivePlan(user, now);
  const limits = PLANS[plan].limits;
  const left = (limit: number | null, usedCount: number) =>
    limit === null ? null : Math.max(0, limit - usedCount);
  return {
    plan, limits, expiresAt: user.plan_expires_at ?? null,
    kspUsedThisMonth: used,
    kspRemaining: left(limits.kspPerMonth, used),
    assistUsedThisMonth: assistUsed,
    assistRemaining: left(limits.assistPerMonth, assistUsed),
    imagesUsedThisMonth: imagesUsed,
    imagesRemaining: left(limits.images, imagesUsed),
  };
}

export type QuotaKind = "generation" | "assist" | "image";

type QuotaLimitKey = "kspPerMonth" | "assistPerMonth" | "images";

const QUOTA_CONFIG: Record<QuotaKind, {
  limitKey: QuotaLimitKey;
  status: number;
  code: string;
  message: string;
}> = {
  generation: {
    limitKey: "kspPerMonth",
    status: 429,
    code: "KSP_QUOTA_EXCEEDED",
    message: "Лимит бесплатных КСП на этот месяц исчерпан. Подключите Pro или дождитесь следующего месяца.",
  },
  assist: {
    limitKey: "assistPerMonth",
    status: 429,
    code: "ASSIST_QUOTA_EXCEEDED",
    message: "Лимит AI-операций на этот месяц исчерпан. Подключите Pro или дождитесь следующего месяца.",
  },
  image: {
    limitKey: "images",
    status: 402,
    code: "IMAGE_QUOTA_EXCEEDED",
    message: "Лимит изображений по тарифу на этот месяц исчерпан. Подключите Pro или дождитесь следующего месяца.",
  },
};

/** Счётчик расхода в текущем месяце для вида операции. */
function usedFor(usage: UserPlanUsage, limitKey: QuotaLimitKey): number {
  if (limitKey === "kspPerMonth") return usage.kspUsedThisMonth;
  if (limitKey === "assistPerMonth") return usage.assistUsedThisMonth;
  return usage.imagesUsedThisMonth;
}

export interface QuotaReservation {
  /** Остаток слотов тарифа на момент резервирования (null — без лимита). */
  remaining: number | null;
  /** Зафиксировать результат: true — оставить учёт, false — вернуть слот. */
  finalize(success: boolean): Promise<void>;
}

/** Структурный исход резервирования без привязки к NextResponse. */
export type QuotaResult =
  | { ok: true; reservation: QuotaReservation }
  | { ok: false; status: number; code: string; message: string; usage: UserPlanUsage | null };

/** Значения для HTTP-ответа при отказе по квоте. */
export function quotaFailure(f: Extract<QuotaResult, { ok: false }>): {
  status: number;
  body: { error: string; code: string } & Partial<UserPlanUsage>;
} {
  const { status, code, message, usage } = f;
  return { status, body: { error: message, code, ...(usage ?? {}) } };
}

/**
 * Атомарно занять слот месячной квоты тарифа ДО обращения к провайдерам.
 *
 * Слот — документ в ai_events с {user_id, task, month, seq}; уникальный частичный
 * индекс не даёт двум параллельным запросам занять один seq, поэтому лимит
 * выдерживается даже при конкурентных запросах. При неудаче генерации слот
 * возвращается через finalize(false).
 */
export async function reserveQuota(
  user: { id: string },
  kind: QuotaKind,
): Promise<QuotaResult> {
  try {
    const { limitKey, status, code, message } = QUOTA_CONFIG[kind];
    const usage = await getPlanForUser(user.id);
    const limit = usage.limits[limitKey];

    if (limit === null) {
      // Безлимит (Pro): учитываем только по факту, слот резервировать не нужно.
      return {
        ok: true,
        reservation: {
          remaining: null,
          finalize: async (success) => {
            if (!success) return;
            try {
              await (await getDb()).collection(COL.aiEvents).insertOne({
                user_id: user.id, task: kind, kind: "slot", ok: true, createdAt: new Date(),
              });
            } catch {
              // учёт для Pro некритичен
            }
          },
        },
      };
    }

    const exceeded = (): Extract<QuotaResult, { ok: false }> => ({
      ok: false, status, code, message, usage,
    });

    if (limit <= 0) return exceeded();
    const used = usedFor(usage, limitKey);
    if (used >= limit) return exceeded();

    const db = await getDb();
    const month = utcMonthWindow().start.toISOString().slice(0, 7);
    // Перебираем ВСЕ номера слотов: возвращённый после неудачи слот образует
    // «дыру» ниже used, и начни мы с used+1 — она никогда бы не освободилась.
    for (let seq = 1; seq <= limit; seq++) {
      try {
        await db.collection(COL.aiEvents).insertOne({
          user_id: user.id, task: kind, kind: "slot", month, seq, ok: true, createdAt: new Date(),
        });
      } catch (e) {
        if ((e as { code?: number }).code === 11000) continue; // слот занят параллельным запросом
        throw e;
      }
      return {
        ok: true,
        reservation: {
          // Один слот занят этим резервированием; при конкурентных запросах
          // остаток может быть пессимистично занижен — это безопаснее завышения.
          remaining: limit - used - 1,
          finalize: async (success) => {
            if (success) return;
            try {
              await db.collection(COL.aiEvents).deleteOne({ user_id: user.id, task: kind, month, seq });
            } catch {
              // слот останется занятым до конца месяца — лучше, чем выдать лишний
            }
          },
        },
      };
    }
    return exceeded();
  } catch {
    // При недоступности хранилища не пропускаем запросы без проверки квоты.
    return {
      ok: false, status: 503, code: "QUOTA_UNAVAILABLE",
      message: "Проверка квоты временно недоступна.", usage: null,
    };
  }
}

/** HTTP-обёртка: reserveQuota + готовый NextResponse при отказе. */
export async function reserveQuotaOrResponse(
  user: { id: string },
  kind: QuotaKind,
): Promise<{ ok: true; reservation: QuotaReservation } | { ok: false; response: NextResponse }> {
  const result = await reserveQuota(user, kind);
  if (result.ok) return result;
  const { status, body } = quotaFailure(result);
  return { ok: false, response: NextResponse.json(body, { status }) };
}
