import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { deletePlanMaterial, getPlanMaterial, saveToOwnedPlan } from "@/lib/materials/plan-materials";
import { MATERIAL_KINDS, type MaterialKind, type StageKey } from "@/lib/types/ksp";

export const runtime = "nodejs";

const PLAN_ID = /^[0-9a-f]{24}$/i;
type Params = { params: Promise<{ id: string; kind: string }> };

async function parse({ params }: Params): Promise<{ id: string; kind: MaterialKind } | NextResponse> {
  const { id, kind } = await params;
  if (!PLAN_ID.test(id) || !(MATERIAL_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "Неверный урок или вид материала" }, { status: 400 });
  }
  return { id, kind: kind as MaterialKind };
}

/** Сохранённый материал урока: лист, карточки, презентация. Только владельцу урока. */
export async function GET(_request: Request, context: Params) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const target = await parse(context);
  if (target instanceof NextResponse) return target;
  try {
    const doc = await getPlanMaterial(target.id, auth.user.id, target.kind);
    if (!doc) return NextResponse.json({ error: "Материал ещё не создан" }, { status: 404 });
    return NextResponse.json(
      { kind: doc.kind, stage: doc.stage, title: doc.title, payload: doc.payload, updatedAt: doc.updated_at.toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Plan material read failed", error);
    return NextResponse.json({ error: "Не удалось открыть материал" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Params) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const target = await parse(context);
  if (target instanceof NextResponse) return target;
  try {
    const deleted = await deletePlanMaterial(target.id, auth.user.id, target.kind);
    return NextResponse.json({ deleted });
  } catch (error) {
    console.error("Plan material delete failed", error);
    return NextResponse.json({ error: "Не удалось удалить материал" }, { status: 500 });
  }
}

/** Сохранение черновика или обновлённого материала урока (например, ручных правок слайдов). */
export async function PUT(request: Request, context: Params) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const target = await parse(context);
  if (target instanceof NextResponse) return target;
  try {
    const body = (await request.json().catch(() => null)) as {
      title?: unknown;
      stage?: unknown;
      payload?: unknown;
    } | null;
    if (!body || body.payload === undefined) {
      return NextResponse.json({ error: "Не передано содержимое материала" }, { status: 400 });
    }
    const stage: StageKey =
      body.stage === "beginning" || body.stage === "middle" || body.stage === "end"
        ? body.stage
        : "middle";
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 200)
        : "Материал урока";
    const saved = await saveToOwnedPlan({
      planId: target.id,
      ownerId: auth.user.id,
      kind: target.kind,
      stage,
      title,
      payload: body.payload,
    });
    if (!saved) {
      return NextResponse.json({ error: "Урок не найден или нет прав на сохранение" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Plan material save failed", error);
    return NextResponse.json({ error: "Не удалось сохранить материал" }, { status: 500 });
  }
}
