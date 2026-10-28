import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, COL, isMongoConfigured, toObjectId } from "@/lib/mongo";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().regex(/^[0-9a-f]{24}$/i) });

interface PlanLikeDoc {
  _id: string;
  user_id: string;
  plan_id: string;
  createdAt: Date;
}

function likeKey(userId: string, planId: string): string {
  return `${userId}:${planId}`;
}

/** GET /api/plans/[id]/like — количество лайков + лайкнул ли текущий пользователь. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isMongoConfigured()) return NextResponse.json({ likes: 0, liked: false });
  const { id } = await params;
  if (!toObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  // Каждый вызов — countDocuments по БД; без лимита это дешёвый способ
  // нагрузить базу перебором id.
  const rl = await checkRateLimitAsync(`like:get:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Слишком много запросов." }, { status: 429 });

  const user = await getCurrentUser();
  const db = await getDb();
  const oid = toObjectId(id);
  if (!oid) return NextResponse.json({ likes: 0, liked: false }, { headers: { "Cache-Control": "no-store" } });
  const plan = await db.collection(COL.plans).findOne({ _id: oid }, { projection: { moderation_hidden: 1 } });
  if (plan?.moderation_hidden === true) {
    return NextResponse.json({ likes: 0, liked: false }, { headers: { "Cache-Control": "no-store" } });
  }
  const likesCollection = db.collection<PlanLikeDoc>(COL.planLikes);
  const likes = await likesCollection.countDocuments({ plan_id: id });
  const liked = user ? Boolean(await likesCollection.findOne({ _id: likeKey(user.id, id) })) : false;
  return NextResponse.json({ likes, liked }, { headers: { "Cache-Control": "no-store" } });
}

/** POST /api/plans/[id]/like — переключить лайк текущего пользователя. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isMongoConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 500 });
  const { id } = await params;
  const parsed = paramsSchema.safeParse({ id });
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const db = await getDb();
  const oid = toObjectId(id);
  // toObjectId возвращает null для не-ObjectId строк — проверяем до запроса.
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const plan = await db.collection(COL.plans).findOne({ _id: oid });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // План, скрытый модерацией, лайкать нельзя: он не должен набирать
  // популярность по прямой ссылке, пока находится в очереди модерации.
  if (plan.moderation_hidden === true) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Лайкать можно публичные и unlisted; свой план — нет смысла.
  if (plan.visibility === "private" && plan.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (plan.owner_id === user.id) {
    return NextResponse.json({ error: "Нельзя лайкать свой план" }, { status: 400 });
  }

  const rl = await checkRateLimitAsync(`like:${user.id}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Слишком часто" }, { status: 429 });

  const likes = db.collection<PlanLikeDoc>(COL.planLikes);
  const key = likeKey(user.id, id);
  const existing = await likes.findOne({ _id: key });
  if (existing) {
    await likes.deleteOne({ _id: key });
  } else {
    await likes.insertOne({ _id: key, user_id: user.id, plan_id: id, createdAt: new Date() });
  }
  // Материализованный счётчик лайков.
  //
  // Раньше список библиотеки считал лайки через $lookup с условием
  // `$expr: { $eq: ["$plan_id", "$$planId"] }`. Такое сравнение не может
  // использовать индекс plan_likes_unique, поэтому внутри $lookup шёл
  // COLLSCAN по ВСЕМ лайкам для каждого плана, а сортировка «по
  // популярности» запускала его до пагинации, то есть по всей выборке.
  // Счётчик в документе плана делает сортировку индексируемой.
  await db
    .collection(COL.plans)
    .updateOne({ _id: oid }, { $inc: { likes_count: existing ? -1 : 1 } });

  const total = await likes.countDocuments({ plan_id: id });
  return NextResponse.json({ liked: !existing, likes: total });
}