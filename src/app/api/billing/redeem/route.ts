import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApiAuth } from "@/lib/api-auth";
import { redeemActivationCode, redeemBodySchema } from "@/lib/billing/redeem";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  let json: unknown;
  try { json = await request.json(); } catch { json = null; }
  const parsed = redeemBodySchema.safeParse(json);
  // Некорректный ввод тоже расходует общий лимит API и Server Action.
  const result = await redeemActivationCode(auth.user.id, parsed.success ? parsed.data.code : null);
  if (!result.ok) return NextResponse.json(result, {
    status: result.status,
    headers: result.retryAfter ? { "Retry-After": String(result.retryAfter) } : undefined,
  });
  revalidatePath("/", "layout");
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
