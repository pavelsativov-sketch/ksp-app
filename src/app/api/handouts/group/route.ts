import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { generateGroupWork } from "@/lib/handouts/group-work";
import { handoutQuota, quotaErrorResponse } from "@/lib/ai/quota-bridge";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  topic: z.string().trim().min(1).max(2_000),
  subject: z.string().trim().min(1).max(200),
  grade: z.coerce.number().int().min(1).max(11),
  language: z.enum(["ru", "kz"]).default("ru"),
  mode: z.enum(["group", "pair"]).default("group"),
  count: z.coerce.number().int().min(2).max(4).default(3),
  learningObjectives: z.array(z.string().trim().max(500)).max(10).optional(),
  values: z.string().trim().max(1_000).optional(),
});

/** Карточки групповой или парной работы по теме урока. */
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  // Тот же счётчик, что у остальных материалов урока: лимит общий на все генерации.
  const rl = await checkRateLimitAsync(`ai:${auth.user.id}`, 30, 3600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Превышен лимит запросов. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
  }

  try {
    const work = await generateGroupWork({ ...parsed.data, quota: handoutQuota(auth.user.id) });
    return NextResponse.json({ work }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const quotaResponse = quotaErrorResponse(error);
    if (quotaResponse) return quotaResponse;
    console.error("Group work generation failed", error);
    return NextResponse.json({ error: "Не удалось составить карточки. Повторите попытку через минуту." }, { status: 500 });
  }
}
