import { NextResponse } from "next/server";
import { z } from "zod";
import { docxToText } from "@/lib/import/docx-to-text";
import { importKspFromText } from "@/lib/ai/import-plan";
import { guardAiRoute } from "@/lib/server/ai-guard";
import { elapsedMs, logError, logEvent } from "@/lib/server/log";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const formMetaSchema = z.object({
  language: z.enum(["ru", "kz"]).default("ru"),
  grade: z.coerce.number().int().min(1).max(12).optional(),
  subject: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const started = Date.now();
  const guard = await guardAiRoute("ai/import-docx");
  if (!guard.ok) return guard.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Bad form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не загружен" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Файл слишком большой (>${MAX_BYTES / (1024 * 1024)} МБ)` },
      { status: 413 },
    );
  }
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return NextResponse.json(
      { error: "Принимается только .docx (Word)" },
      { status: 415 },
    );
  }

  const meta = formMetaSchema.safeParse({
    language: form.get("language") ?? "ru",
    grade: form.get("grade") ?? undefined,
    subject: form.get("subject") ?? undefined,
  });
  if (!meta.success) {
    return NextResponse.json(
      { error: meta.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  let rawText: string;
  try {
    const buf = await file.arrayBuffer();
    rawText = await docxToText(buf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Не удалось разобрать .docx";
    logError("ai.import.parseError", {
      userId: guard.userId,
      errorMessage: msg,
    });
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  if (!rawText.trim()) {
    return NextResponse.json(
      { error: "В файле не нашлось текста" },
      { status: 422 },
    );
  }

  try {
    const payload = await importKspFromText({
      rawText,
      language: meta.data.language,
      hints: {
        grade: meta.data.grade,
        subject: meta.data.subject,
      },
    });
    logEvent("ai.import.ok", {
      userId: guard.userId,
      durationMs: elapsedMs(started),
      bytes: file.size,
      chars: rawText.length,
      language: meta.data.language,
    });
    return NextResponse.json({
      payload,
      preview: rawText.slice(0, 1000),
      charCount: rawText.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    logError("ai.import.error", {
      userId: guard.userId,
      durationMs: elapsedMs(started),
      errorMessage: msg,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
