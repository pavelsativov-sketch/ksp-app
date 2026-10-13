import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, COL, isMongoConfigured, toObjectId } from "@/lib/mongo";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { embeddingProgress, type TextbookDoc } from "@/lib/rag/ingest";
import {
  loadArmanPvCatalog,
  fetchArmanPvGradeLive,
  ensureArmanPvTextbookIngested,
  type ArmanPvCatalogItemWithStatus,
} from "@/lib/rag/armanpv";
import type { ObjectId } from "mongodb";

export const runtime = "nodejs";
export const maxDuration = 300;

const postSchema = z.object({
  armanpvId: z.string().trim().min(1).max(200),
  subjectId: z.string().trim().optional().nullable(),
});

/**
 * GET /api/textbooks/armanpv — официальный каталог учебников издательства «Арман-ПВ» (1–11 классы)
 * со статусом индексации каждого учебника в базе RAG.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const gradeParam = url.searchParams.get("grade");
  const grade = gradeParam ? Number(gradeParam) : null;
  const subjectIdParam = url.searchParams.get("subjectId")?.trim() || null;
  const subjectNameParam = url.searchParams.get("subject")?.trim() || null;
  const langParam = url.searchParams.get("language")?.trim() || null;
  const q = url.searchParams.get("q")?.trim().toLowerCase() || "";
  const live = url.searchParams.get("live") === "1" || url.searchParams.get("live") === "true";

  if (live && grade && Number.isInteger(grade) && grade >= 1 && grade <= 11) {
    try {
      await fetchArmanPvGradeLive(grade);
    } catch (e) {
      console.warn("Live Arman-PV sync failed, falling back to cached snapshot:", e);
    }
  }

  let catalog = loadArmanPvCatalog();

  const subjectByName = new Map<string, string>();
  const subjectById = new Map<string, string>();
  const ingestedByArmanId = new Map<string, TextbookDoc & { _id: ObjectId }>();

  if (isMongoConfigured()) {
    try {
      const db = await getDb();
      const [subjects, existingTextbooks] = await Promise.all([
        db
          .collection<{ _id: ObjectId; name_ru: string }>(COL.subjects)
          .find({}, { projection: { name_ru: 1 } })
          .toArray(),
        db
          .collection<TextbookDoc & { _id: ObjectId }>(COL.textbooks)
          .find({ armanpv_id: { $exists: true, $ne: null } })
          .toArray(),
      ]);

      for (const s of subjects) {
        const sid = s._id.toString();
        subjectByName.set(s.name_ru.toLowerCase(), sid);
        subjectById.set(sid, s.name_ru);
      }
      for (const tb of existingTextbooks) {
        if (tb.armanpv_id) {
          ingestedByArmanId.set(tb.armanpv_id, tb);
        }
      }
    } catch (e) {
      console.warn("Failed to enrich Arman-PV catalog from MongoDB:", e);
    }
  }

  const targetSubjectName =
    subjectNameParam?.toLowerCase() ||
    (subjectIdParam ? subjectById.get(subjectIdParam)?.toLowerCase() ?? null : null);

  if (grade && Number.isInteger(grade) && grade >= 1 && grade <= 11) {
    catalog = catalog.filter((item) => item.grade === grade);
  }
  if (langParam && ["ru", "kz", "ug", "uz"].includes(langParam)) {
    catalog = catalog.filter((item) => item.language === langParam);
  }
  if (targetSubjectName) {
    catalog = catalog.filter(
      (item) => (item.subjectNameRu ?? "").toLowerCase() === targetSubjectName,
    );
  }
  if (q) {
    catalog = catalog.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.subjectNameRu ?? "").toLowerCase().includes(q),
    );
  }

  const items: ArmanPvCatalogItemWithStatus[] = catalog.map((item) => {
    const ingested = ingestedByArmanId.get(item.id);
    const mappedSubjectId = item.subjectNameRu
      ? subjectByName.get(item.subjectNameRu.toLowerCase()) ?? null
      : null;

    return {
      ...item,
      subjectId: ingested?.subject_id ?? mappedSubjectId,
      ingestedTextbookId: ingested ? ingested._id.toString() : null,
      status: ingested ? ingested.status : "not_ingested",
      statusError: ingested?.status_error ?? null,
      pageCount: ingested?.page_count ?? null,
      chunkCount: ingested?.chunk_count ?? 0,
      embedding: ingested ? embeddingProgress(ingested) : null,
    };
  });

  // Сортируем: сначала готовые (ready), затем основные учебники (!isGuide) вперёд метод. пособий
  items.sort((a, b) => {
    const readyA = a.status === "ready" ? 1 : 0;
    const readyB = b.status === "ready" ? 1 : 0;
    if (readyA !== readyB) return readyB - readyA;
    const guideA = a.isGuide ? 1 : 0;
    const guideB = b.isGuide ? 1 : 0;
    if (guideA !== guideB) return guideA - guideB;
    return a.grade - b.grade;
  });

  return NextResponse.json({
    items,
    total: items.length,
  });
}

/**
 * POST /api/textbooks/armanpv — скачивает выбранный учебник с сайта Арман-ПВ
 * и индексирует его в общую базу RAG (или сразу возвращает уже проиндексированный).
 */
export async function POST(request: Request) {
  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "MongoDB не настроена" }, { status: 500 });
  }

  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`armanpv:${auth.user.id}`, 25, 3600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Превышен лимит подключений учебников. Попробуйте позже." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const cleanSubjectId =
    parsed.data.subjectId && toObjectId(parsed.data.subjectId)
      ? parsed.data.subjectId
      : null;

  try {
    const { textbook, item, cached } = await ensureArmanPvTextbookIngested({
      armanpvId: parsed.data.armanpvId,
      subjectId: cleanSubjectId,
    });

    return NextResponse.json({
      cached,
      item,
      textbook: {
        id: textbook.id,
        title: textbook.title,
        subject_id: textbook.subject_id,
        grade: textbook.grade,
        status: textbook.status,
        status_error: textbook.status_error,
        has_embeddings: textbook.has_embeddings,
        embedding: embeddingProgress(textbook),
        page_count: textbook.page_count,
        chunk_count: textbook.chunk_count,
        visibility: textbook.visibility,
        owner_id: textbook.owner_id,
        armanpv_id: textbook.armanpv_id ?? item.id,
        source_url: textbook.source_url ?? item.pdfUrl,
        cover_url: textbook.cover_url ?? item.coverUrl,
        language: textbook.language ?? item.language,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Не удалось подключить учебник Арман-ПВ";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
