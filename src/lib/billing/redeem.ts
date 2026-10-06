import "server-only";
import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { COL, getDb, toObjectId } from "@/lib/mongo";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import type { UserBillingFields } from "./plans";

export type ActivationCodeType = "pro_1y" | "pro_3m" | "pro_1m";
export interface BillingCodeDocument {
  _id?: ObjectId;
  codeHash: string;
  type: ActivationCodeType;
  status: "active" | "redeemed" | "revoked";
  redeemed_by: string | null;
  redeemed_at: Date | null;
  created_at: Date;
  note?: string;
}

export const INVALID_CODE_MESSAGE = "Не удалось активировать код. Проверьте код или обратитесь в поддержку.";
export const activationCodeSchema = z.string().trim().min(1).max(256);
export const redeemBodySchema = z.object({ code: activationCodeSchema });
export type RedemptionResult =
  | { ok: true; plan: "pro"; expiresAt: Date }
  | { ok: false; error: string; status: 400 | 401 | 429 | 503; retryAfter?: number };

export function hashActivationCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

// Календарное продление UTC: 31 января + месяц = последний день февраля.
export function extendPlanExpiry(base: Date, type: ActivationCodeType): Date {
  const result = new Date(base);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + (type === "pro_1y" ? 12 : type === "pro_3m" ? 3 : 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** Только сервер: userId берётся вызывающим обработчиком из проверенной сессии. */
export async function redeemActivationCode(userId: string, code: unknown): Promise<RedemptionResult> {
  const rate = await checkRateLimitAsync(`billing:redeem:${userId}`, 10, 3600_000);
  if (!rate.ok) return {
    ok: false, error: "Слишком много попыток. Попробуйте позже.", status: 429,
    retryAfter: Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000)),
  };
  const parsed = activationCodeSchema.safeParse(code);
  if (!parsed.success) return { ok: false, error: INVALID_CODE_MESSAGE, status: 400 };
  const id = toObjectId(userId);
  if (!id) return { ok: false, error: "Требуется вход", status: 401 };

  try {
    const db = await getDb();
    const session = db.client.startSession();
    try {
      // Все три записи коммитятся вместе. Требуется MongoDB replica set / Atlas.
      return await session.withTransaction(async (): Promise<RedemptionResult> => {
        const now = new Date();
        const user = await db.collection<UserBillingFields>(COL.users).findOne({ _id: id }, { session });
        if (!user) return { ok: false, error: "Требуется вход", status: 401 };
        const redeemed = await db.collection<BillingCodeDocument>(COL.billingCodes).findOneAndUpdate(
          { codeHash: hashActivationCode(parsed.data), status: "active", type: { $in: ["pro_1y", "pro_3m", "pro_1m"] } },
          { $set: { status: "redeemed", redeemed_by: userId, redeemed_at: now } },
          { session, returnDocument: "after" },
        );
        if (!redeemed) return { ok: false, error: INVALID_CODE_MESSAGE, status: 400 };
        const base = user.plan_expires_at && user.plan_expires_at > now ? user.plan_expires_at : now;
        const expiresAt = extendPlanExpiry(base, redeemed.type);
        const updated = await db.collection(COL.users).updateOne(
          { _id: id }, { $set: { plan: "pro", plan_expires_at: expiresAt } }, { session },
        );
        if (updated.matchedCount !== 1) throw new Error("Billing user disappeared");
        await db.collection(COL.planEvents).insertOne({
          user_id: userId, event: "activation_code_redeemed", code_id: redeemed._id,
          code_type: redeemed.type, previous_plan: user.plan ?? "free",
          previous_expires_at: user.plan_expires_at ?? null,
          plan: "pro", plan_expires_at: expiresAt, created_at: now,
        }, { session });
        return { ok: true, plan: "pro", expiresAt };
      });
    } finally {
      await session.endSession();
    }
  } catch {
    // Не логируем код и не раскрываем состояние документа при сбое.
    return { ok: false, error: "Активация временно недоступна. Попробуйте позже.", status: 503 };
  }
}
