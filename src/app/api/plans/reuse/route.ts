import { NextResponse } from "next/server";
import { getDb, COL, isMongoConfigured } from "@/lib/mongo";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import type { PlanDoc } from "@/lib/plans-repo";
import type { KspContent } from "@/lib/types/ksp";
import type { ReusableBlockKind, ReusableStageKey } from "@/lib/types/provenance";

export const runtime = "nodejs";

const STAGES: ReusableStageKey[] = ["beginning", "middle", "end"];
const MAX_RESULTS = 80;
const MAX_PLANS = 100;

type ReuseBlock = {
  id: string;
  kind: ReusableBlockKind;
  source: {
    planId: string;
    title: string;
    grade: number;
    language: "ru" | "kz";
    topic: string;
    stageKey?: ReusableStageKey;
  };
  preview: string;
  payload: unknown;
};

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function makePreview(parts: Array<string | undefined>, max = 320): string {
  const value = parts.map((part) => part?.trim()).filter(Boolean).join(" · ");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const rateLimit = await checkRateLimitAsync(`ksp-reuse:${auth.user.id}`, 60, 60_000);
  if (!rateLimit.ok) {
    return NextResponse.json({ error: "Слишком частый поиск. Попробуйте немного позже." }, {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))) },
    });
  }
  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") as ReusableBlockKind | null;
  if (kind !== "stage" && kind !== "task" && kind !== "criterion") {
    return NextResponse.json({ error: "Invalid reusable block kind" }, { status: 400 });
  }
  const query = normalizeSearch(url.searchParams.get("q")?.slice(0, 120) ?? "");

  const projection: Record<string, 1> = {
    _id: 1,
    title: 1,
    grade: 1,
    language: 1,
    created_at: 1,
    "content.topic": 1,
    "content.learningObjectives": 1,
  };
  if (kind === "stage") projection["content.stages"] = 1;
  if (kind === "task") {
    for (const stage of STAGES) projection[`content.stages.${stage}.tasks`] = 1;
  }
  if (kind === "criterion") projection["content.assessmentCriteria"] = 1;

  try {
    const db = await getDb();
    const plans = await db.collection<PlanDoc>(COL.plans)
      .find({ owner_id: auth.user.id, moderation_hidden: { $ne: true } }, { projection })
      .sort({ updated_at: -1 })
      .limit(MAX_PLANS)
      .toArray();

    const blocks: ReuseBlock[] = [];
    for (const plan of plans) {
      if (!plan._id) continue;
      const planId = plan._id.toString();
      const content = (plan.content ?? {}) as Partial<KspContent>;
      const sourceBase = {
        planId,
        title: String(plan.title ?? "Без названия").slice(0, 300),
        grade: Number.isInteger(plan.grade) ? plan.grade : 5,
        language: plan.language === "kz" ? "kz" as const : "ru" as const,
        topic: String(content.topic ?? ""),
        objectiveCodes: (content.learningObjectives ?? []).map((objective) => objective.code).filter(Boolean),
      };
      if (kind === "stage") {
        for (const stageKey of STAGES) {
          const stage = content.stages?.[stageKey];
          if (!stage) continue;
          const preview = makePreview([stage.teacherActions, stage.studentActions, stage.resources, stage.homework]);
          if (!preview || (query && !normalizeSearch(`${sourceBase.title} ${sourceBase.topic} ${preview}`).includes(query))) continue;
          blocks.push({ id: `${planId}:stage:${stageKey}`, kind, source: { ...sourceBase, stageKey }, preview, payload: stage });
        }
      } else if (kind === "task") {
        for (const stageKey of STAGES) {
          const tasks = content.stages?.[stageKey]?.tasks ?? [];
          for (const task of tasks) {
            const preview = makePreview([task.question, task.hint]);
            if (!query || normalizeSearch(`${sourceBase.title} ${sourceBase.topic} ${preview}`).includes(query)) {
              blocks.push({ id: `${planId}:task:${stageKey}:${task.id}`, kind, source: { ...sourceBase, stageKey }, preview, payload: task });
            }
          }
        }
      } else {
        for (const [index, criterion] of (content.assessmentCriteria ?? []).entries()) {
          const preview = makePreview([criterion]);
          if (!query || normalizeSearch(`${sourceBase.title} ${sourceBase.topic} ${preview}`).includes(query)) {
            blocks.push({ id: `${planId}:criterion:${index}`, kind, source: sourceBase, preview, payload: criterion });
          }
        }
      }
      if (blocks.length >= MAX_RESULTS) break;
    }

    return NextResponse.json({ blocks: blocks.slice(0, MAX_RESULTS) });
  } catch (error) {
    console.warn("Failed to search reusable KSP blocks:", error);
    return NextResponse.json({ error: "Could not load reusable blocks" }, { status: 500 });
  }
}
