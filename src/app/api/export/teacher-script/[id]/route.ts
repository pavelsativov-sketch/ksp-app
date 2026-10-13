import { NextResponse } from "next/server";
import { buildTeacherScriptDocx } from "@/lib/export/docx";
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

  if (!isMongoConfigured()) return NextResponse.json({ error: "Сервер не настроен" }, { status: 500 });
  const user = await getCurrentUser();
  const rl = await checkRateLimitAsync(`export:${user?.id || clientIp(request)}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Слишком много скачиваний. Повторите через минуту." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  const plan = await getAccessiblePlan(id, user?.id ?? null);
  if (!plan) return NextResponse.json({ error: "План не найден" }, { status: 404 });

  const watermark = await resolveWatermark(user);

  // Ошибка сборки ловится здесь: необработанное исключение превращалось в
  // пустой 500, и учитель не понимал, что делать.
  let buffer: Buffer;
  try {
    buffer = await buildTeacherScriptDocx(plan, { watermark });
  } catch (err) {
    console.error("[export/teacher-script] сборка не удалась", err);
    return NextResponse.json(
      { error: "Не удалось собрать документ. Попробуйте ещё раз." },
      { status: 502 },
    );
  }

  const filename = `Слова педагога - ${plan.title || "КСП"}.docx`.replace(/[^\p{L}\p{N}_\-. ]/gu, "_");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
