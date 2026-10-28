import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { listSchoolAudit } from "@/lib/school-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/school/[id]/audit — журнал действий школы (для руководства). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{24}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid school id" }, { status: 400 });
  }
  const limitRaw = new URL(request.url).searchParams.get("limit");
  const limit = Math.min(500, Math.max(1, Number(limitRaw) || 100));
  try {
    const items = await listSchoolAudit(auth.user.id, id, limit);
    return NextResponse.json({ items });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Access denied";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
