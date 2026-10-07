import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTasks } from "@/lib/ai/tasks";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { interactiveTaskSchema } from "@/lib/validation/ksp";
import { reserveQuotaOrResponse } from "@/lib/billing/quota";

const bodySchema = z.object({
  topic: z.string().trim().min(1).max(2_000),
  grade: z.coerce.number().int().min(1).max(11),
  subject: z.string().trim().min(1).max(200),
  stage: z.enum(["beginning", "middle", "end"]),
  language: z.enum(["ru", "kz"]).default("ru"),
  count: z.coerce.number().int().min(1).max(8).default(3),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

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
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  // Генерация заданий — вспомогательная AI-операция: тоже под тарифной квотой,
  // иначе лимит КСП обходится через неё.
  const quota = await reserveQuotaOrResponse(auth.user, "assist");
  if (!quota.ok) return quota.response;

  try {
    const generated = await generateTasks(parsed.data);
    const tasks = z.array(interactiveTaskSchema).max(parsed.data.count).safeParse(generated);
    if (!tasks.success) {
      await quota.reservation.finalize(false);
      console.error("AI generated invalid tasks", tasks.error.flatten());
      return NextResponse.json({ error: "AI вернул некорректные задания. Повторите попытку." }, { status: 502 });
    }
    await quota.reservation.finalize(true);
    return NextResponse.json({ tasks: tasks.data, quota: { remaining: quota.reservation.remaining } });
  } catch (error) {
    await quota.reservation.finalize(false);
    console.error("Task generation failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI-провайдер сейчас недоступен. Создайте задания вручную или повторите попытку позже." },
      { status: 503 },
    );
  }
}
