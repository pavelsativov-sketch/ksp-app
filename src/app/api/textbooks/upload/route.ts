import { NextResponse } from "next/server";
import { getDb, COL, isMongoConfigured, toObjectId } from "@/lib/mongo";
import {
  ingestTextbookFromBuffer,
  type TextbookDoc,
} from "@/lib/rag/ingest";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getPlanForUser } from "@/lib/billing/quota";

export const runtime = "nodejs";
export const maxDuration = 300; // до 5 минут на индексацию

const MAX_BYTES = 50 * 1024 * 1024; // 50 МБ

export async function POST(request: Request) {
  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "MongoDB не настроена" }, { status: 500 });
  }

  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const user = auth.user;

  const rl = await checkRateLimitAsync(`upload:${user.id}`, 10, 3600_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Превышен лимит загрузок. Попробуйте позже." }, { status: 429 });
  }

  // Квота учебников по тарифу. Раньше limits.textbooks был объявлен, но не
  // проверялся нигде: Free-аккаунт мог залить неограниченное число PDF
  // (50 МБ каждый) и нагенерировать чанки с эмбеддингами за чужой счёт.
  let db;
  try {
    db = await getDb();
    const usage = await getPlanForUser(user.id);
    const quota = usage.limits.textbooks;
    if (quota <= 0) {
      return NextResponse.json(
        { error: "Загрузка учебников доступна на тарифе Pro. Обложите урок учебником на Pro." },
        { status: 403 },
      );
    }
    const current = await db.collection(COL.textbooks).countDocuments({ owner_id: user.id });
    if (current >= quota) {
      return NextResponse.json(
        { error: `На тарифе доступно ${quota} учебник(ов). Удалите лишний, чтобы загрузить новый.`, current, quota },
        { status: 403 },
      );
    }
  } catch (e) {
    // Fail-closed: при недоступности биллинга не пропускаем загрузку.
    console.error("Textbook quota check failed", e);
    return NextResponse.json({ error: "Не удалось проверить лимит учебников. Попробуйте позже." }, { status: 503 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  const subjectId = (form.get("subjectId") as string | null)?.trim() || null;
  const gradeRaw = form.get("grade");
  const grade = gradeRaw ? Number(gradeRaw) : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не получен" }, { status: 400 });
  }
  if (!title) return NextResponse.json({ error: "Укажите название" }, { status: 400 });
  if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Поддерживается только PDF" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Файл больше ${MAX_BYTES / 1024 / 1024} МБ` },
      { status: 400 },
    );
  }
  if (subjectId && !toObjectId(subjectId)) {
    return NextResponse.json({ error: "Некорректный subjectId" }, { status: 400 });
  }

  const arr = new Uint8Array(await file.arrayBuffer());
  const buffer = Buffer.from(arr);

  const now = new Date();
  const created = await db.collection<TextbookDoc>(COL.textbooks).insertOne({
    owner_id: user.id,
    title,
    subject_id: subjectId,
    grade: grade !== null && Number.isFinite(grade) ? grade : null,
    status: "pending",
    status_error: null,
    page_count: null,
    chunk_count: 0,
    visibility: "private",
    has_embeddings: false,
    created_at: now,
    updated_at: now,
  });
  const textbookId = created.insertedId.toString();

  try {
    // Chunks are durable now. The owner advances embeddings via the bounded resume endpoint.
    const { pageCount, chunkCount, hasEmbeddings, embeddingsDeferred } =
      await ingestTextbookFromBuffer({ db, textbookId, pdfBuffer: buffer });

    return NextResponse.json({
      id: textbookId,
      status: "ready",
      pageCount,
      chunkCount,
      hasEmbeddings,
      embeddingsDeferred,
      embedding: { status: "pending", completed: 0, total: chunkCount, error: null },
    });
  } catch (e) {
    return NextResponse.json(
      { id: textbookId, status: "error", error: e instanceof Error ? e.message : "ingest failed" },
      { status: 500 },
    );
  }
}
