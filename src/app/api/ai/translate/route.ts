import { NextResponse } from "next/server";
import { z } from "zod";
import { translatePlan } from "@/lib/ai/translate";
import { kspContentSchema } from "@/lib/validation/ksp";
import { guardAiRoute } from "@/lib/server/ai-guard";
import { elapsedMs, logError, logEvent } from "@/lib/server/log";

const bodySchema = z.object({
  content: z.unknown(),
  targetLanguage: z.enum(["ru", "kz"]),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const started = Date.now();
  const guard = await guardAiRoute("ai/translate");
  if (!guard.ok) return guard.response;

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

  const contentParsed = kspContentSchema.safeParse(parsed.data.content);
  if (!contentParsed.success) {
    return NextResponse.json(
      {
        error:
          "Текущий план невалиден. Сохраните без ошибок и попробуйте перевести.",
      },
      { status: 400 },
    );
  }

  try {
    const translated = await translatePlan(
      contentParsed.data,
      parsed.data.targetLanguage,
    );
    logEvent("ai.translate.ok", {
      userId: guard.userId,
      durationMs: elapsedMs(started),
      targetLanguage: parsed.data.targetLanguage,
    });
    return NextResponse.json({ content: translated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    logError("ai.translate.error", {
      userId: guard.userId,
      durationMs: elapsedMs(started),
      errorMessage: msg,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
