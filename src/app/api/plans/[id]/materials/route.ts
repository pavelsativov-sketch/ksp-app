import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { listPlanMaterials } from "@/lib/materials/plan-materials";

export const runtime = "nodejs";

const PLAN_ID = /^[0-9a-f]{24}$/i;

/** Какие материалы урока сохранены на сервере (без самих материалов). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!PLAN_ID.test(id)) return NextResponse.json({ error: "Неверный идентификатор урока" }, { status: 400 });
  try {
    // Фильтр по владельцу: чужие материалы в список не попадут даже по чужому id урока.
    const materials = await listPlanMaterials(id, auth.user.id);
    return NextResponse.json({ materials }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Plan materials list failed", error);
    return NextResponse.json({ error: "Не удалось загрузить материалы урока" }, { status: 500 });
  }
}
