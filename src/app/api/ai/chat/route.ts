import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { reserveQuotaOrResponse } from "@/lib/billing/quota";
import { executeWithFallback } from "@/lib/ai/providers";

const bodySchema = z.object({
  question: z.string().trim().min(2).max(2000),
  planContext: z
    .object({
      topic: z.string().max(2000).optional(),
      subject: z.string().max(200).optional(),
      grade: z.number().int().min(1).max(11).optional(),
      language: z.enum(["ru", "kz"]).optional(),
      content: z.unknown().optional(),
    })
    .optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(20)
    .optional(),
});

export const runtime = "nodejs";
export const maxDuration = 30;

function buildPrompt(data: z.infer<typeof bodySchema>): { system: string; user: string } {
  const lang = data.planContext?.language === "kz" ? "kz" : "ru";
  const system =
    lang === "kz"
      ? "Сен қазақстандық мұғалімнің көмекшісісің. Қысқа, нақты жауап бер. ҚМЖ тақырыбы бойынша кеңес бер, бірақ бүкіл жоспарды қайта жасама. Қазақ тілінде жауап бер."
      : "Ты помощник учителя Казахстана по КСП. Отвечай кратко и по делу — совет, подсказка, улучшение формулировки. НЕ перегенерируй весь план целиком, помоги точечно.";

  const ctx = data.planContext;
  const snapshot = ctx?.content ? JSON.stringify(ctx.content).slice(0, 4000) : "";
  const historyBlock = (data.history ?? [])
    .slice(-8)
    .map((m) => `${m.role === "user" ? "Учитель" : "Ассистент"}: ${m.content}`)
    .join("\n");
  const user = [
    ctx?.topic ? `Тема урока: ${ctx.topic}` : null,
    ctx?.subject ? `Предмет: ${ctx.subject}, класс: ${ctx.grade ?? "—"}` : null,
    snapshot ? `Фрагмент плана: ${snapshot}` : null,
    historyBlock ? `История:\n${historyBlock}` : null,
    `Вопрос: ${data.question}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { system, user };
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`ai-chat:${auth.user.id}`, 30, 3600_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Лимит запросов. Попробуйте позже." }, { status: 429 });
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

  // Чат — assist-квота (не generation), чтобы не тратить слоты КСП на вопросы
  const quota = await reserveQuotaOrResponse(auth.user, "assist");
  if (!quota.ok) return quota.response;

  try {
    const { system, user } = buildPrompt(parsed.data);
    const answer = await executeWithFallback("enhance", async (client, model) => {
      const res = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.6,
        max_tokens: 1200,
      });
      const text = res.choices[0]?.message?.content?.trim();
      if (!text) throw new Error("Пустой ответ модели");
      return text;
    });

    await quota.reservation.finalize(true);
    return NextResponse.json({ answer, quota: { remaining: quota.reservation.remaining } });
  } catch (e) {
    await quota.reservation.finalize(false);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Нет настроенных API ключей")) {
      return NextResponse.json({ error: "AI-провайдер не настроен" }, { status: 503 });
    }
    return NextResponse.json({ error: "Не удалось ответить. Попробуйте ещё раз." }, { status: 503 });
  }
}
