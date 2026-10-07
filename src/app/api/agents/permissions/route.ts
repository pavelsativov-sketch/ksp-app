import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { alwaysAllows, listPending, resolvePermission, revokeAlwaysAllow } from "@/lib/agents/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Нерешённые запросы агента на опасные действия (для карточки Allow/Deny). */
export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  return NextResponse.json(
    {
      pending: await listPending(auth.user.id),
      alwaysAllowed: await alwaysAllows(auth.user.id),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Revoke the account-level "always allow high-risk commands" preference. */
export async function DELETE() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  await revokeAlwaysAllow(auth.user.id);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

/** Решение пользователя: allow/deny (+always для MVP-политики). */
export async function POST(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  let body: { id?: string; allow?: boolean; always?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.id !== "string" || typeof body.allow !== "boolean") {
    return NextResponse.json({ error: "Нужны id и allow" }, { status: 400 });
  }
  const ok = await resolvePermission(auth.user.id, body.id, body.allow, body.always === true);
  if (!ok) return NextResponse.json({ error: "Запрос не найден или уже решён" }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
