import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, COL, isMongoConfigured, toObjectId } from "@/lib/mongo";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";
import { addComment, deleteComment, getComments, getUserNames } from "@/lib/comments";
import type { CommentRow, UserNameRow } from "@/lib/comments";

export const runtime = "nodejs";

const createSchema = z.object({
  planId: z.string().regex(/^[0-9a-f]{24}$/i),
  text: z.string().min(1).max(2000),
  parentId: z.string().regex(/^[0-9a-f]{24}$/i).nullable().optional(),
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

/** GET /api/comments?planId=... — список комментариев к плану. */
export async function GET(request: Request) {
  if (!isMongoConfigured()) return NextResponse.json({ comments: [] });
  const { searchParams } = new URL(request.url);
  const planId = searchParams.get("planId") ?? "";
  if (!toObjectId(planId)) return NextResponse.json({ error: "Invalid planId" }, { status: 400 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  if (!(await canAccessPlan(planId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = await checkRateLimitAsync(`comments:get:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Слишком много запросов." }, { status: 429 });

  const comments = await getComments(planId);
  const userIds = comments.map((c) => c.user_id);
  const names = await getUserNames(userIds);
  const withNames = comments.map((c) => ({ ...c, author: formatAuthor(names.get(c.user_id)) }));
  return NextResponse.json({ comments: withNames }, { headers: { "Cache-Control": "no-store" } });
}

/** POST /api/comments — добавить комментарий. */
export async function POST(request: Request) {
  if (!isMongoConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const rl = await checkRateLimitAsync(`comments:post:${user.id}`, 30, 60_000);
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

  const { planId, text, parentId } = parsed.data;
  if (!(await canAccessPlan(planId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Проверяем, что родительский комментарий существует и принадлежит тому же плану.
  if (parentId) {
    const parentOid = toObjectId(parentId);
    if (!parentOid) return NextResponse.json({ error: "Invalid parentId" }, { status: 400 });
    const db = await getDb();
    const parent = await db
      .collection(COL.comments)
      .findOne({ _id: parentOid }, { projection: { plan_id: 1 } });
    if (!parent || parent.plan_id !== planId) {
      return NextResponse.json({ error: "Родительский комментарий не найден" }, { status: 400 });
    }
  }

  const comment = await addComment(planId, user.id, text, parentId);
  const names = await getUserNames([user.id]);
  const withAuthor = { ...comment, author: formatAuthor(names.get(user.id)) };
  return NextResponse.json({ comment: withAuthor }, { status: 201 });
}

/** DELETE /api/comments?commentId=... — удалить свой комментарий. */
export async function DELETE(request: Request) {
  if (!isMongoConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const commentId = searchParams.get("commentId") ?? "";
  if (!toObjectId(commentId)) return NextResponse.json({ error: "Invalid commentId" }, { status: 400 });

  const rl = await checkRateLimitAsync(`comments:delete:${user.id}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Слишком часто" }, { status: 429 });

  const deleted = await deleteComment(commentId, user.id);
  if (!deleted) return NextResponse.json({ error: "Не удалось удалить комментарий" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/**
 * Публичное представлениеавтора.
 *
 * Раньше наружу отдавался email каждого комментатора, то есть любой
 * аутентифицированный пользователь мог собрать адреса всех, кто когда-либо
 * оставлял запись. Email — персональные данные, и для показа имени он
 * не нужен.
 *
 * Для пользователя без имени показываем локальную часть адреса: она
 * не раскрывает ни домен, ни сам почтовый ящик.
 */
function formatAuthor(name: UserNameRow | undefined): { name: string } {
  if (!name) return { name: "Пользователь" };
  const display = name.fullName?.trim();
  if (display) return { name: display };
  return { name: name.email.split("@")[0] ?? "Учитель" };
}
