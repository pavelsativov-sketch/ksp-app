import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getPlanForUser } from "@/lib/billing/quota";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  try {
    return NextResponse.json(await getPlanForUser(auth.user.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Не удалось загрузить план. Попробуйте позже." }, { status: 503 });
  }
}
