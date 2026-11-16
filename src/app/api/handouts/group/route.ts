import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { generateGroupWork } from "@/lib/handouts/group-work";
import { illustrate } from "@/lib/handouts/images";
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
  withImages: z.boolean().default(true),
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
    const quota = handoutQuota(auth.user.id);
    let work = await generateGroupWork({ ...parsed.data, quota });
    // Картинка к ситуации, как на карточках учителя. Лимит картинок общий с листами;
    // без ключей или при исчерпанной квоте карточки остаются без иллюстрации.
    const imageRl = parsed.data.withImages ? await checkRateLimitAsync(`image:${auth.user.id}`, 20, 3600_000) : { ok: false };
    if (imageRl.ok) {
      const { topic, subject, grade } = parsed.data;
      const illustrated = await illustrate(
        work.cards,
        { topic, subject, grade },
        // Без описания рисуем нейтральную сцену: русский заголовок FLUX превратил бы в надпись.
        (card) => card.imagePrompt || "Pupils working together at a classroom table with notebooks and a laptop",
        (card, image) => ({ ...card, imageBase64: image.base64, imageMime: image.mimeType === "image/png" ? ("image/png" as const) : ("image/jpeg" as const) }),
        () => quota.reserve("image"),
      ).catch(() => null);
      if (illustrated) work = { ...work, cards: illustrated.items };
    }
    return NextResponse.json({ work }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const quotaResponse = quotaErrorResponse(error);
    if (quotaResponse) return quotaResponse;
    console.error("Group work generation failed", error);
    return NextResponse.json({ error: "Не удалось составить карточки. Повторите попытку через минуту." }, { status: 500 });
  }
}
