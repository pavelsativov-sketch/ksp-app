import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { resolveConfirmation } from "@/lib/agents/computer/confirm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ответ учителя на запрос подтверждения.
 *
 * Отдельный маршрут от основного: цикл агента висит в длинном POST, и если
 * ждать ответа там же, пришлось бы держать соединение открытым и нечем было
 * бы управлять с другой вкладки.
 */
export async function POST(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  let body: { id?: unknown; allow?: unknown };
  try {
    body = (await req.json()) as { id?: unknown; allow?: unknown };
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Не указан запрос" }, { status: 400 });

  // Отсутствие ответа = отказ. Явное «нет» и молчание обрабатываются одинаково:
  // агент не действует, пока учитель не подтвердил.
  const allow = body.allow === true;
  const ok = await resolveConfirmation(auth.user.id, id, allow);

  return NextResponse.json({ ok, allowed: allow });
}
