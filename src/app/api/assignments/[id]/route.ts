import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { closeAssignment, getAssignmentResults, repeatAssignment } from "@/lib/assignments";

export const runtime = "nodejs";

/** Управление своей выдачей: результаты (GET), повтор (?action=repeat, POST), закрыть (?action=close, POST). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const { id } = await params;
  try {
    const results = await getAssignmentResults(auth.user.id, id);
    if (!results) return NextResponse.json({ error: "Выдача не найдена." }, { status: 404 });
    return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Не удалось загрузить результаты." }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const { id } = await params;
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  try {
    if (action === "repeat") {
      const result = await repeatAssignment(auth.user.id, id);
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "close") {
      await closeAssignment(auth.user.id, id);
      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Неизвестное действие." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось выполнить действие." },
      { status: 400 },
    );
  }
}
