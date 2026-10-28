import { NextResponse } from "next/server";
import { z } from "zod";
import { optionalBooleanFlag } from "@/lib/validation/boolean-flag";
import { generateKspWithModel } from "@/lib/ai/generate";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { reserveQuotaOrResponse } from "@/lib/billing/quota";
import { retrieveTextbookContext } from "@/lib/rag/retrieve";
import { ensureArmanPvTextbookIngested } from "@/lib/rag/armanpv";
import { summarizeRagUse } from "@/lib/rag/metadata";
import { AI_HISTORY_SCHEMA_VERSION, buildHistoryParams, computeParamsHash, logAiHistory } from "@/lib/ai/history";

const bodySchema = z.object({
  grade: z.coerce.number().int().min(1).max(11),
  subject: z.string().trim().min(1).max(200),
  topic: z.string().trim().min(1).max(2_000),
  learningObjectives: z.array(z.string().trim().min(1).max(1_000)).max(30).optional(),
  language: z.enum(["ru", "kz"]).default("ru"),
  schoolProfile: z.enum(["emn", "ogn"]).optional(),
  section: z.string().trim().max(500).optional(),
  previousTopic: z.string().trim().max(500).optional(),
  previousHomework: z.string().trim().max(1_000).optional(),
  textbookId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
  armanpvId: z.string().trim().max(200).optional(),
  refine: optionalBooleanFlag,
});

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`ai:${auth.user.id}`, 30, 3600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Превышен лимит запросов. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const quota = await reserveQuotaOrResponse(auth.user, "generation");
  if (!quota.ok) return quota.response;
  const { reservation } = quota;

  // Retrieval text stays server-side; clients receive only provenance metadata.
  let textbookContext: string | undefined;
  let retrievedContext: Awaited<ReturnType<typeof retrieveTextbookContext>> = null;
  let resolvedTextbookId = parsed.data.textbookId;
  const selectedTextbook = Boolean(parsed.data.textbookId || parsed.data.armanpvId);
  if (!resolvedTextbookId && parsed.data.armanpvId) {
    try {
      const ingested = await ensureArmanPvTextbookIngested({ armanpvId: parsed.data.armanpvId });
      resolvedTextbookId = ingested.textbook.id;
    } catch (e) {
      console.warn("Arman-PV auto-ingest failed:", e);
    }
  }
  if (resolvedTextbookId) {
    const query = `${parsed.data.subject}. Тема: ${parsed.data.topic}. ${parsed.data.section ?? ""} Класс ${parsed.data.grade}. ${
      (parsed.data.learningObjectives ?? []).join(" ")
    }`;
    try {
      retrievedContext = await retrieveTextbookContext({
        textbookId: resolvedTextbookId,
        query,
        k: 6,
        userId: auth.user.id,
      });
      textbookContext = retrievedContext?.promptBlock || undefined;
    } catch (e) {
      console.warn("RAG retrieval failed:", e);
    }
  }
  const ragInfo = summarizeRagUse(selectedTextbook, retrievedContext);

  try {
    const { payload: content, model } = await generateKspWithModel({ ...parsed.data, textbookContext });
    // Серверная история: model / schema_version / source_ids / paramsHash (без текста ДЗ).
    try {
      const params = buildHistoryParams({
        grade: parsed.data.grade,
        subject: parsed.data.subject,
        topic: parsed.data.topic,
        learningObjectives: parsed.data.learningObjectives,
        language: parsed.data.language,
        schoolProfile: parsed.data.schoolProfile,
        section: parsed.data.section,
        previousTopic: parsed.data.previousTopic,
        previousHomework: parsed.data.previousHomework,
        textbookId: resolvedTextbookId ?? null,
        armanpvId: parsed.data.armanpvId ?? null,
      });
      const sourceIds = ragInfo.sources.map((s) => s.id);
      await logAiHistory({
        user_id: auth.user.id,
        task: "generation",
        model,
        schema_version: AI_HISTORY_SCHEMA_VERSION,
        source_ids: sourceIds,
        paramsHash: computeParamsHash(params),
        params,
        rag: ragInfo,
      });
    } catch {}
    await reservation.finalize(true);
    return NextResponse.json({ content, rag: ragInfo, quota: { remaining: reservation.remaining } });
  } catch (error) {
    await reservation.finalize(false);
    console.error("KSP generation failed", error);
    return NextResponse.json(
      {
        error: "Не удалось сгенерировать КСП. Провайдер ИИ сейчас недоступен — попробуйте через минуту или напишите план вручную: поля формы остаются доступными.",
      },
      { status: 503 },
    );
  }
}
