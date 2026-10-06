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

  // ������� �������� � �������� (��������� �����), � zip ��� � ��� CPU ��
  // ������ � ��� ������ �� IP ��� ������� ������ ��������� �������.
  const rl = await checkRateLimitAsync(`export:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "������� ����� �������� ��������." }, { status: 429 });

  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const user = await getCurrentUser();
  const plan = await getAccessiblePlan(id, user?.id ?? null);
  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }


  const watermark = await resolveWatermark(user);
  const buffer = await buildKspPptx(plan, { watermark });
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
