import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getControlOwner, setControlOwner } from "@/lib/agents/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Владелец управления рабочей средой: пользователь или AI-агент. */
export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  return NextResponse.json(
    { control: await getControlOwner(auth.user.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** TAKE CONTROL / GIVE CONTROL TO AI. */
export async function POST(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  let body: { control?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.control !== "user" && body.control !== "ai") {
    return NextResponse.json({ error: "control должен быть 'user' или 'ai'" }, { status: 400 });
  }
  await setControlOwner(auth.user.id, body.control);
  return NextResponse.json({ ok: true, control: body.control }, { headers: { "Cache-Control": "no-store" } });
}
