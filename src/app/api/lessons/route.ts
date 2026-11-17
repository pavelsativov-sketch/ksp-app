import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { productTools } from "@/lib/agents/tools/product";
import { kitAnswersSchema } from "@/lib/materials/kit";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  grade: z.coerce.number().int().min(1).max(11),
  subject: z.string().trim().min(1).max(200),
  topic: z.string().trim().min(1).max(2_000),
  language: z.enum(["ru", "kz"]).default("ru"),
  /** Ответы учителя «Что будет на уроке»; без них КСП строится как раньше. */
  kit: kitAnswersSchema.optional(),
});

/** Новый урок в один шаг: класс, предмет, тема. Цели из ГОСО, генератор и квоты те же, что у агента. */
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`ai:${auth.user.id}`, 30, 3600_000);
  if (!rl.ok) return NextResponse.json({ error: "Превышен лимит запросов. Попробуйте позже." }, { status: 429 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Укажите класс, предмет и тему." }, { status: 400 });

  // Сбой БД/генерации должен давать JSON-ошибку с текстом, а не пустой 500.
  try {
    const result = await productTools.createKsp({ ...parsed.data, saveCopy: false, teacherName: auth.user.fullName ?? undefined }, { userId: auth.user.id, taskId: "site" });
    if (!result.success || !("planId" in result)) {
      return NextResponse.json({ error: result.error ?? "Не удалось создать урок." }, { status: 503 });
    }
    return NextResponse.json({ planId: result.planId });
  } catch (err) {
    console.error("[lessons] запрос не удался", err);
    return NextResponse.json({ error: "Не удалось создать урок. Попробуйте ещё раз." }, { status: 500 });
  }
}
