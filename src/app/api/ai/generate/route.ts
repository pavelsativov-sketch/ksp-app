import { NextResponse } from "next/server";
import { z } from "zod";
import { generateKsp } from "@/lib/ai/generate";
import { guardAiRoute } from "@/lib/server/ai-guard";
import { elapsedMs, logError, logEvent } from "@/lib/server/log";

const bodySchema = z.object({
  grade: z.coerce.number().int().min(1).max(12),
  subject: z.string().trim().min(1),
  topic: z.string().trim().min(1),
  learningObjectives: z.array(z.string()).optional(),
  language: z.enum(["ru", "kz"]).default("ru"),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const started = Date.now();
  const guard = await guardAiRoute("ai/generate");
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

  try {
    const content = await generateKsp(parsed.data);
    logEvent("ai.generate.ok", {
      userId: guard.userId,
      durationMs: elapsedMs(started),
      grade: parsed.data.grade,
      language: parsed.data.language,
    });
    return NextResponse.json({ content });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    logError("ai.generate.error", {
      userId: guard.userId,
      durationMs: elapsedMs(started),
      errorMessage: msg,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
