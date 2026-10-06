"use server";

import { AdminError } from "@/lib/admin/auth";
import { createAdminCode, revokeAdminCode } from "@/lib/admin/codes";
import { listModerationQueue, resolveReport, setPlanHidden } from "@/lib/moderation";

type Failure = { ok: false; error: string; status: number; retryAfter?: number };
function failure(error: unknown): Failure {
  // Never forward Mongo errors: duplicate-key messages can contain the code hash.
  if (error instanceof AdminError) return { ok: false, error: error.message, status: error.status, retryAfter: error.retryAfter };
  return { ok: false, error: "Операция временно недоступна. Обновите список перед повтором.", status: 503 };
}

export async function createAdminCodeAction(input: unknown): Promise<Failure | { ok: true; id: string; plaintext: string }> {
  try {
    const result = await createAdminCode(input);
    return { ok: true, ...result };
  } catch (error) {
    return failure(error);
  }
}

export async function revokeAdminCodeAction(input: unknown): Promise<Failure | { ok: true }> {
  try {
    await revokeAdminCode(input);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function hidePlanAction(input: unknown): Promise<Failure | { ok: true }> {
  try {
    await setPlanHidden(input, true);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function unhidePlanAction(input: unknown): Promise<Failure | { ok: true }> {
  try {
    await setPlanHidden(input, false);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function resolveReportAction(input: unknown): Promise<Failure | { ok: true }> {
  try {
    await resolveReport(input);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/** Пакетное создание кодов: возвращает открытые тексты один раз (как одиночное). */
export async function createAdminCodesBulkAction(input: unknown): Promise<Failure | { ok: true; codes: Array<{ id: string; plaintext: string }> }> {
  try {
    const { createAdminCodesBulk } = await import("@/lib/admin/codes");
    const codes = await createAdminCodesBulk(input);
    return { ok: true, codes };
  } catch (error) {
    return failure(error);
  }
}

/** Ручная выдача/продление Pro пользователю (для продаж без онлайн-оплаты). */
export async function grantProAction(input: unknown): Promise<Failure | { ok: true; email: string; expiresAt: string }> {
  try {
    const { grantPro } = await import("@/lib/admin/codes");
    const result = await grantPro(input);
    return { ok: true, ...result };
  } catch (error) {
    return failure(error);
  }
}

export type ModerationQueue = Awaited<ReturnType<typeof listModerationQueue>>;
export async function moderationQueueAction(): Promise<Failure | { ok: true; items: ModerationQueue }> {
  try {
    const items = await listModerationQueue();
    return { ok: true, items };
  } catch (error) {
    return failure(error);
  }
}
