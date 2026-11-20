import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { deletePlanMaterial, getPlanMaterial, saveToOwnedPlan } from "@/lib/materials/plan-materials";
import { MATERIAL_KINDS, type MaterialKind, type StageKey } from "@/lib/types/ksp";

export const runtime = "nodejs";

const PLAN_ID = /^[0-9a-f]{24}$/i;
const MAX_DECK_BYTES = 16 * 1024 * 1024;
const MAX_OTHER_BYTES = 1 * 1024 * 1024;
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
  const rl = await checkRateLimitAsync(`plan:materials:mut:${auth.user.id}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
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
  const rl = await checkRateLimitAsync(`plan:materials:mut:${auth.user.id}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  const target = await parse(context);
  if (target instanceof NextResponse) return target;
  try {
    const raw = await request.text();
    const maxBytes = target.kind === "deck" ? MAX_DECK_BYTES : MAX_OTHER_BYTES;
    if (Buffer.byteLength(raw, "utf8") > maxBytes) {
      return NextResponse.json({ error: "Слишком большой размер материала" }, { status: 413 });
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
    }
    const body =
      parsedJson && typeof parsedJson === "object"
        ? (parsedJson as { title?: unknown; stage?: unknown; payload?: unknown })
        : null;
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
