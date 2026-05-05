import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTasks } from "@/lib/ai/tasks";
import { guardAiRoute } from "@/lib/server/ai-guard";
import { elapsedMs, logError, logEvent } from "@/lib/server/log";

const bodySchema = z.object({
  topic: z.string().trim().min(1),
  grade: z.coerce.number().int().min(1).max(12),
  subject: z.string().trim().min(1),
  stage: z.enum(["beginning", "middle", "end"]),
  language: z.enum(["ru", "kz"]).default("ru"),
  count: z.coerce.number().int().min(1).max(8).default(3),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const started = Date.now();
  const guard = await guardAiRoute("ai/generate-tasks");
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
    const tasks = await generateTasks(parsed.data);
    logEvent("ai.generate-tasks.ok", {
      userId: guard.userId,
      durationMs: elapsedMs(started),
      stage: parsed.data.stage,
      count: tasks.length,
    });
    return NextResponse.json({ tasks });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    logError("ai.generate-tasks.error", {
      userId: guard.userId,
      durationMs: elapsedMs(started),
      errorMessage: msg,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
