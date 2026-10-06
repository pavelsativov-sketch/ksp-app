import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, COL, isMongoConfigured, toObjectId } from "@/lib/mongo";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";
import { addReview, getReviews, getUserNames } from "@/lib/comments";
import type { ReviewRow, UserNameRow } from "@/lib/comments";

export const runtime = "nodejs";

const createSchema = z.object({
  planId: z.string().regex(/^[0-9a-f]{24}$/i),
  rating: z.number().int().min(1).max(5),
  feedback: z.string().min(1).max(2000),
});

/** Проверка доступа к плану: свой, публичный или unlisted. */
async function canAccessPlan(planId: string, userId: string): Promise<boolean> {
  const db = await getDb();
  const oid = toObjectId(planId);
  if (!oid) return false;
  const plan = await db
    .collection(COL.plans)
    .findOne({ _id: oid }, { projection: { visibility: 1, owner_id: 1, moderation_hidden: 1 } });
  if (!plan) return false;
  if (plan.moderation_hidden) return false;
  if (plan.owner_id === userId) return true;
  return plan.visibility !== "private";
}

/** GET /api/reviews?planId=... — список отзывов о плане. */
export async function GET(request: Request) {
  if (!isMongoConfigured()) return NextResponse.json({ reviews: [], average: 0, count: 0 });
  const { searchParams } = new URL(request.url);
  const planId = searchParams.get("planId") ?? "";
  if (!toObjectId(planId)) return NextResponse.json({ error: "Invalid planId" }, { status: 400 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  if (!(await canAccessPlan(planId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = await checkRateLimitAsync(`reviews:get:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Слишком много запросов." }, { status: 429 });

  const reviews = await getReviews(planId);
  const userIds = reviews.map((r) => r.reviewer_id);
  const names = await getUserNames(userIds);
  const withNames = reviews.map((r) => ({ ...r, reviewer: formatReviewer(names.get(r.reviewer_id)) }));
  const average = reviews.length > 0
    ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
    : 0;
  return NextResponse.json({ reviews: withNames, average, count: reviews.length }, { headers: { "Cache-Control": "no-store" } });
}

/** POST /api/reviews — добавить отзыв. */
export async function POST(request: Request) {
  if (!isMongoConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const rl = await checkRateLimitAsync(`reviews:post:${user.id}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Слишком часто" }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные", details: parsed.error.flatten() }, { status: 400 });
  }

  const { planId, rating, feedback } = parsed.data;
  if (!(await canAccessPlan(planId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Нельзя оставить отзыв на свой план.
  const db = await getDb();
  const oid = toObjectId(planId);
  if (!oid) return NextResponse.json({ error: "Invalid planId" }, { status: 400 });
  const plan = await db
    .collection(COL.plans)
    .findOne({ _id: oid }, { projection: { owner_id: 1 } });
  if (plan?.owner_id === user.id) {
    return NextResponse.json({ error: "Нельзя оценить свой план" }, { status: 400 });
  }

  const review = await addReview(planId, user.id, rating, feedback);
  const names = await getUserNames([user.id]);
  const withReviewer = { ...review, reviewer: formatReviewer(names.get(user.id)) };
  return NextResponse.json({ review: withReviewer }, { status: 201 });
}

/**
 * Публичное представлениеоценщика.
 *
 * Раньше наружу отдавался email каждого оценщика, то есть любой
 * аутентифицированный пользователь мог собрать адреса всех, кто когда-либо
 * оставлял запись. Email — персональные данные, и для показа имени он
 * не нужен.
 *
 * Для пользователя без имени показываем локальную часть адреса: она
 * не раскрывает ни домен, ни сам почтовый ящик.
 */
function formatReviewer(name: UserNameRow | undefined): { name: string } {
  if (!name) return { name: "Пользователь" };
  const display = name.fullName?.trim();
  if (display) return { name: display };
  return { name: name.email.split("@")[0] ?? "Учитель" };
}
