import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { getPlanById } from "@/lib/plans-repo";
import { getWorksheetTasks, listPlanMaterials } from "@/lib/materials/plan-materials";
import { applyWorksheetAssessment, assessmentState, attachMaterial, worksheetAssessmentLines } from "@/lib/materials/kit-sync";
import { PLAN_CONFLICT, planState, updatePlanWithVersion } from "@/lib/plan-versions";
import { kspContentSchema } from "@/lib/validation/ksp";
import { MATERIAL_KINDS, type LessonPlanRow, type StageKey } from "@/lib/types/ksp";

export const runtime = "nodejs";

const PLAN_ID = /^[0-9a-f]{24}$/i;
type Params = { params: Promise<{ id: string }> };

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync-assessment") }),
  z.object({ action: z.literal("attach"), kind: z.enum(MATERIAL_KINDS), stage: z.enum(["beginning", "middle", "end"]) }),
]);

async function ownedPlan(id: string, userId: string): Promise<LessonPlanRow | null> {
  if (!PLAN_ID.test(id)) return null;
  const plan = await getPlanById(id);
  return plan && plan.owner_id === userId ? plan : null;
}

/** Строки «Оценивания» по рабочему листу урока и этап, к которому лист подключён. */
async function sheetAssessment(plan: LessonPlanRow, userId: string): Promise<{ stage: StageKey; lines: string[] } | null> {
  const sheet = await getWorksheetTasks(plan.id, userId);
  if (!sheet) return null;
  const stage = plan.content.kit?.slots.find((slot) => slot.kind === "worksheet")?.stage ?? sheet.stage ?? "middle";
  return { stage, lines: worksheetAssessmentLines(sheet.tasks, plan.language) };
}

/** Согласованность урока: что сохранено, что не подключено к этапам, совпадают ли баллы листа с «Оцениванием». */
export async function GET(_request: Request, { params }: Params) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const { id } = await params;
  try {
    const plan = await ownedPlan(id, auth.user.id);
    if (!plan) return NextResponse.json({ error: "Урок не найден среди ваших" }, { status: 404 });
    const [materials, sheet] = await Promise.all([listPlanMaterials(plan.id, auth.user.id), sheetAssessment(plan, auth.user.id)]);
    const placed = new Set((plan.content.kit?.slots ?? []).map((slot) => slot.kind));
    return NextResponse.json(
      {
        materials,
        unattached: materials.filter((m) => !placed.has(m.kind)),
        assessment: sheet ? assessmentState(plan.content, sheet.stage, sheet.lines) : "none",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Kit state failed", error);
    return NextResponse.json({ error: "Не удалось проверить материалы урока" }, { status: 500 });
  }
}

/** Баллы листа → «Оценивание» или подключение материала к этапу. Сохраняется с историей версий. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const { id } = await params;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Неверное действие" }, { status: 400 });
  try {
    const plan = await ownedPlan(id, auth.user.id);
    if (!plan) return NextResponse.json({ error: "Урок не найден среди ваших" }, { status: 404 });

    let content = plan.content;
    if (parsed.data.action === "sync-assessment") {
      const sheet = await sheetAssessment(plan, auth.user.id);
      if (!sheet || sheet.lines.length === 0) return NextResponse.json({ error: "Рабочий лист ещё не создан" }, { status: 404 });
      content = applyWorksheetAssessment(content, sheet.stage, sheet.lines);
    } else {
      const { kind, stage } = parsed.data;
      const material = (await listPlanMaterials(plan.id, auth.user.id)).find((m) => m.kind === kind);
      if (!material) return NextResponse.json({ error: "Материал ещё не создан" }, { status: 404 });
      content = attachMaterial(content, { kind, stage, title: material.title }, plan.language);
    }

    const valid = kspContentSchema.safeParse(content);
    if (!valid.success) {
      console.error("Kit change produced an invalid plan", valid.error.issues.slice(0, 3));
      return NextResponse.json({ error: "Не удалось обновить КСП" }, { status: 500 });
    }
    const saved = await updatePlanWithVersion(plan.id, auth.user.id, plan.updated_at, { state: planState({ ...plan, content: valid.data }), reason: "save" });
    return NextResponse.json({ ok: true, updatedAt: saved.updated_at });
  } catch (error) {
    if (error instanceof Error && error.message === PLAN_CONFLICT) {
      return NextResponse.json({ error: "КСП только что изменился. Обновите страницу и повторите." }, { status: 409 });
    }
    console.error("Kit change failed", error);
    return NextResponse.json({ error: "Не удалось обновить КСП" }, { status: 500 });
  }
}
