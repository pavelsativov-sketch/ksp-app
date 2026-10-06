import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { saveKit } from "@/lib/kits";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";
import type { Handout } from "@/lib/handouts/types";

export const runtime = "nodejs";

/**
 * Сохранение комплекта материалов.
 *
 * Материалы приходят из браузера: учитель нажал «Сохранить комплект» в
 * предпросмотре, и мы кладём их в архив, чтобы переиспользовать позже.
 * Размер ограничен в самой схеме (3 МБ) — с base64-картинками комплект
 * может быть заметно крупнее обычного КСП.
 */
const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  topic: z.string().trim().max(300).optional().default(""),
  subject_id: z.string().regex(/^[0-9a-f]{24}$/i).nullable().optional().default(null),
  grade: z.coerce.number().int().min(1).max(11).nullable().optional().default(null),
  class_id: z.string().regex(/^[0-9a-f]{24}$/i).nullable().optional().default(null),
  handouts: z.array(z.unknown()).min(1).max(4),
  extra: z.unknown().nullable().optional().default(null),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const rl = await checkRateLimitAsync(`kit:save:${clientIp(request)}`, 30, 3600_000);
  if (!rl.ok) return NextResponse.json({ error: "Слишком много сохранений. Попробуйте позже." }, { status: 429 });

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

  const result = await saveKit(user.id, {
    ...parsed.data,
    handouts: parsed.data.handouts as Handout[],
    extra: (parsed.data.extra as Handout | null) ?? null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ kit: result.kit }, { status: 201 });
}
