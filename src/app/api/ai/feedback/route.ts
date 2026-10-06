import { NextResponse } from "next/server";
import { z } from "zod";
import { isMongoConfigured } from "@/lib/mongo";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { logAiFeedback } from "@/lib/ai/telemetry";

const bodySchema = z.object({
  kind: z.enum(["generate", "enhance"]),
  section: z.string().max(60).optional(),
  rating: z.enum(["up", "down"]),
  note: z.string().max(500).optional(),
});

export const runtime = "nodejs";

/**
 * POST /api/ai/feedback — оценка качества AI пользователем (👍/👎).
 * Пишется в ai_events вместе с телеметрией вызовов — так копится
 * реальная статистика качества моделей вместо ручных бенчмарков.
 */
export async function POST(request: Request) {
  if (!isMongoConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 500 });
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`feedback:${auth.user.id}`, 120, 60 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Слишком часто" }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) } });

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

  logAiFeedback({
    user_id: auth.user.id,
    kind: parsed.data.kind,
    section: parsed.data.section ?? null,
    rating: parsed.data.rating,
    note: parsed.data.note ?? null,
  });
  return NextResponse.json({ ok: true });
}