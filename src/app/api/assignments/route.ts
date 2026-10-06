import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { createAssignment, listTeacherAssignments } from "@/lib/assignments";

export const runtime = "nodejs";

/** Выдачи учителя: список (GET) и создание (POST). */
export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  try {
    const rows = await listTeacherAssignments(auth.user.id);
    return NextResponse.json({ assignments: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Не удалось загрузить выдачи." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`ai:${auth.user.id}`, 30, 3600_000);
  if (!rl.ok) return NextResponse.json({ error: "Превышен лимит запросов. Попробуйте позже." }, { status: 429 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const result = await createAssignment(auth.user.id, json);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось создать выдачу." },
      { status: 400 },
    );
  }
}
