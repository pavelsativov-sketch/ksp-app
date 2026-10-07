import { NextResponse } from "next/server";
import { buildKspPptx } from "@/lib/export/pptx";
import { getAccessiblePlan } from "@/lib/plans-repo";
import { getCurrentUser } from "@/lib/auth";
import { isMongoConfigured } from "@/lib/mongo";
import { resolveWatermark } from "@/lib/billing/watermark";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Ограничение по IP: сборка презентации тяжелее остальных экспортов,
  // а zip ещё и жжёт CPU на сервере. Общий лимит на все форматы — 30 в минуту.
  const rl = await checkRateLimitAsync(`export:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Слишком много скачиваний. Повторите через минуту." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Сервер не настроен" }, { status: 500 });
  }

  const user = await getCurrentUser();
  const plan = await getAccessiblePlan(id, user?.id ?? null);
  if (!plan) {
    return NextResponse.json({ error: "План не найден" }, { status: 404 });
  }

  const watermark = await resolveWatermark(user);

  // Ошибка сборки ловится здесь. Раньше исключение из pptxgenjs уходило
  // необработанным, и браузер получал пустой 500 без объяснения: учитель
  // видел «ошибка сайта» вместо «презентация не собралась, попробуйте ещё раз».
  let buffer: Buffer;
  try {
    buffer = await buildKspPptx(plan, { watermark });
  } catch (err) {
    console.error("[export/pptx] сборка не удалась", err);
    return NextResponse.json(
      { error: "Не удалось собрать презентацию. Попробуйте ещё раз или скачайте документ Word." },
      { status: 502 },
    );
  }

  const filename = `${plan.title || "ksp"}.pptx`.replace(/[^\p{L}\p{N}_\-. ]/gu, "_");

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
