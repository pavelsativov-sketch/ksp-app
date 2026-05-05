import { NextResponse } from "next/server";
import { z } from "zod";
import { critiquePlan } from "@/lib/ai/critique";
import { kspContentSchema } from "@/lib/validation/ksp";
import { guardAiRoute } from "@/lib/server/ai-guard";
import { elapsedMs, logError, logEvent } from "@/lib/server/log";

const bodySchema = z.object({
  content: z.unknown(),
  language: z.enum(["ru", "kz"]).default("ru"),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const started = Date.now();
  const guard = await guardAiRoute("ai/critique");
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
          "План невалиден — не могу проверить. Сохраните план без ошибок и повторите.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await critiquePlan(contentParsed.data, parsed.data.language);
    logEvent("ai.critique.ok", {
      userId: guard.userId,
      durationMs: elapsedMs(started),
      issues: result.issues.length,
      language: parsed.data.language,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    logError("ai.critique.error", {
      userId: guard.userId,
      durationMs: elapsedMs(started),
      errorMessage: msg,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
