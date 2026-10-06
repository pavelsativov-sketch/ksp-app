import { NextResponse } from "next/server";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { submitAttempt } from "@/lib/assignments";

export const runtime = "nodejs";

/** Сдача учеником: серверная проверка, сохраняется лучший результат. Вход не нужен. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const rl = await checkRateLimitAsync(`assign:submit:${code}`, 60, 3600_000);
  if (!rl.ok) return NextResponse.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const result = await submitAttempt(code, json);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось принять ответы.";
    const status = /завершён|не найдена/i.test(message) ? 410 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
