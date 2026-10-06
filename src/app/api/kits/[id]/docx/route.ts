import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getKit } from "@/lib/kits";
import { buildCombinedDocx, buildHandoutDocx } from "@/lib/handouts/docx";
import { resolveWatermark } from "@/lib/billing/watermark";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";
import type { Handout } from "@/lib/handouts/types";

export const runtime = "nodejs";

/** GET /api/kits/[id]/docx — комплект одним документом. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const { id } = await params;

  const rl = await checkRateLimitAsync(`kit:docx:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Слишком много запросов." }, { status: 429 });

  const kit = await getKit(user.id, id);
  if (!kit) return NextResponse.json({ error: "Комплект не найден" }, { status: 404 });

  const handouts = kit.handouts ?? [];
  if (handouts.length === 0) return NextResponse.json({ error: "Комплект пуст" }, { status: 404 });
  const all: Handout[] = kit.extra ? [...handouts, kit.extra] : handouts;

  const watermark = await resolveWatermark(user);
  // Несколько материалов — единый документ (памятки с новой страницы).
  const buffer = all.length > 1
    ? await buildCombinedDocx(all, { watermark })
    : await buildHandoutDocx(all[0]!, { watermark });

  const filename = `Комплект — ${kit.title}.docx`.replace(/[^\p{L}\p{N}_\-. ]/gu, "_");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
