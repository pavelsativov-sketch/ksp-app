import { NextResponse } from "next/server";
import { z } from "zod";
import { booleanFlag, optionalBooleanFlag } from "@/lib/validation/boolean-flag";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { buildCombinedDocx, buildHandoutDocx } from "@/lib/handouts/docx";
import type { Handout } from "@/lib/handouts/types";
import { resolveWatermark } from "@/lib/billing/watermark";

export const runtime = "nodejs";

/**
 * Печать уже сгенерированного материала без повторной генерации:
 * учительская версия (с ответами) или ученическая (без ответов и дескрипторов).
 * Принимает JSON предпросмотра — AI не вызывается, квота не тратится.
 */
const taskSchema = z.looseObject({
  type: z.string().min(1).max(30),
  prompt: z.string().min(1).max(5000),
  criterion: z.string().max(2000).default(""),
  descriptor: z.string().max(2000).default(""),
  points: z.coerce.number().int().min(0).max(10),
});

const handoutSchema = z.looseObject({
  kind: z.enum(["worksheet", "flashcards", "crossword"]),
  title: z.string().min(1).max(500),
  intro: z.string().max(2000).optional().default(""),
  metaLine: z.string().max(500).optional().default(""),
  tasks: z.array(taskSchema).max(10).optional(),
  cards: z.array(z.looseObject({ front: z.string().max(1000), back: z.string().max(2000) })).max(30).optional(),
});

const bodySchema = z.object({
  handout: handoutSchema,
  extra: handoutSchema.optional(),
  // По умолчанию — учительская версия (с ответами), как и было раньше.
// Сам разбор строки "false"/"0"/"on" — в booleanFlag: `z.coerce.boolean()`
// превращал их в true, и клиент, отправляющий форму вместо JSON,
// получал ключи ответов вместо ученической версии.
includeAnswers: booleanFlag.default(true),
  fileName: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`print:${auth.user.id}`, 60, 3600_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Превышен лимит запросов. Попробуйте позже." }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные материала." }, { status: 400 });
  }

  try {
    const { handout, extra, includeAnswers, fileName } = parsed.data;
    const watermark = await resolveWatermark(auth.user);
    const buffer = extra
      ? await buildCombinedDocx([handout as Handout, extra as Handout], { watermark, includeAnswers })
      : await buildHandoutDocx(handout as Handout, { watermark, includeAnswers });
    const name = (fileName || `${includeAnswers ? "Материал" : "Материал — ученикам"}.docx`).replace(
      /[^\p{L}\p{N}_\-. +]/gu,
      "_",
    );
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Не удалось собрать документ. Попробуйте ещё раз." }, { status: 502 });
  }
}
