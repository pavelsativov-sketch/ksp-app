import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAssessment } from "@/lib/ai/assessment";
import { assessmentContentSchema } from "@/lib/validation/assessment";
import { guardAiRoute } from "@/lib/server/ai-guard";
import { elapsedMs, logError, logEvent } from "@/lib/server/log";

const bodySchema = z.object({
  kind: z.enum(["sor", "soch"]),
  grade: z.number().int().min(1).max(12),
  subject: z.string().trim().min(1).max(200),
  sections: z.string().max(2000).default(""),
  quarter: z.number().int().min(1).max(4).nullable().optional(),
  durationMinutes: z.number().int().min(5).max(180).nullable().optional(),
  learningObjectives: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(64),
        text: z.string().trim().min(1).max(1000),
      }),
    )
    .max(20)
    .default([]),
  language: z.enum(["ru", "kz"]).default("ru"),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const started = Date.now();
  const guard = await guardAiRoute("ai/generate-assessment");
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
    const raw = await generateAssessment({
      kind: parsed.data.kind,
      grade: parsed.data.grade,
      subject: parsed.data.subject,
      sections: parsed.data.sections,
      quarter: parsed.data.quarter ?? null,
      durationMinutes: parsed.data.durationMinutes ?? null,
      learningObjectives: parsed.data.learningObjectives,
      language: parsed.data.language,
    });

    // Validate against the canonical zod schema before sending to the
    // client so a misbehaving model can't poison the editor state.
    const validated = assessmentContentSchema.safeParse(raw);
    if (!validated.success) {
      logError("ai.generate-assessment.invalid", {
        userId: guard.userId,
        durationMs: elapsedMs(started),
        zodIssues: validated.error.issues.slice(0, 3).map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
      return NextResponse.json(
        {
          error:
            "AI вернул некорректную структуру. Попробуйте ещё раз — обычно помогает повтор.",
        },
        { status: 502 },
      );
    }

    logEvent("ai.generate-assessment.ok", {
      userId: guard.userId,
      durationMs: elapsedMs(started),
      kind: parsed.data.kind,
      tasks: validated.data.tasks.length,
      language: parsed.data.language,
    });
    return NextResponse.json({ content: validated.data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    logError("ai.generate-assessment.error", {
      userId: guard.userId,
      durationMs: elapsedMs(started),
      errorMessage: msg,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
