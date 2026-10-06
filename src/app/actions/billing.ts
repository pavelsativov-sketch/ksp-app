"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { redeemActivationCode, type RedemptionResult } from "@/lib/billing/redeem";

export async function redeemActivationCodeAction(code: string): Promise<RedemptionResult> {
  // Идентификатор пользователя никогда не принимаем от клиента.
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется вход", status: 401 };
  const result = await redeemActivationCode(user.id, code);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
