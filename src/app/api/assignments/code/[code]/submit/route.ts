import { NextResponse } from "next/server";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";
import { submitAttempt } from "@/lib/assignments";

export const runtime = "nodejs";
const MAX_SUBMIT_BYTES = 64 * 1024;

/** Сдача учеником: серверная проверка, сохраняется лучший результат. Вход не нужен. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[a-z0-9]{4,12}$/i.test(code)) {
    return NextResponse.json({ error: "Некорректный код выдачи." }, { status: 400 });
  }
  const [byIp, byCode] = await Promise.all([
    checkRateLimitAsync(`assign:submit:ip:${clientIp(request)}`, 40, 3600_000),
    checkRateLimitAsync(`assign:submit:${code}`, 60, 3600_000),
  ]);
  if (!byIp.ok || !byCode.ok) {
    return NextResponse.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });
  }

  let json: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_SUBMIT_BYTES) {
      return NextResponse.json({ error: "Слишком большой размер ответа." }, { status: 413 });
    }
    json = JSON.parse(raw);
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
