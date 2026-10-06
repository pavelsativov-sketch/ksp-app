import { NextResponse } from "next/server";
import { z } from "zod";
import { isMongoConfigured } from "@/lib/mongo";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/admin/auth";
import { submitFeedback, getFeedback, respondToFeedback, updateFeedbackStatus, getFeedbackStats } from "@/lib/feedback";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const submitSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(10).max(5000),
  category: z.enum(["bug", "feature", "general"]),
});

const respondSchema = z.object({
  response: z.string().min(1).max(5000),
});

const statusSchema = z.object({
  status: z.enum(["new", "in_progress", "resolved", "closed"]),
});

/**
 * POST /api/feedback — отправить отзыв.
 */
export async function POST(request: Request) {
  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const rl = await checkRateLimitAsync(`feedback:post:${user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Слишком часто" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await submitFeedback(
    user.id,
    parsed.data.rating,
    parsed.data.comment,
    parsed.data.category,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}

/**
 * GET /api/feedback — получить отзывы (только для администраторов).
 */
export async function GET(request: Request) {
  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const status = (error as { status: number }).status;
      return NextResponse.json({ error: "Доступ запрещён" }, { status });
    }
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as "new" | "in_progress" | "resolved" | "closed" | null;
  const category = searchParams.get("category") as "bug" | "feature" | "general" | null;
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

  const [feedbackResult, stats] = await Promise.all([
    getFeedback("admin", { status: status ?? undefined, category: category ?? undefined, limit, offset }),
    getFeedbackStats(),
  ]);

  return NextResponse.json({
    feedback: feedbackResult.feedback,
    total: feedbackResult.total,
    stats,
  });
}

/**
 * PATCH /api/feedback — ответить на отзыв или изменить статус (только для администраторов).
 */
export async function PATCH(request: Request) {
  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const admin = await getCurrentUser();
  if (!admin) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const rl = await checkRateLimitAsync(`feedback:patch:${admin.id}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Слишком часто" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const feedbackId = searchParams.get("id");
  if (!feedbackId) {
    return NextResponse.json({ error: "Missing feedback ID" }, { status: 400 });
  }

  // Update status
  if (typeof body === "object" && body !== null && "status" in body) {
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Некорректный статус" }, { status: 400 });
    }
    const result = await updateFeedbackStatus(feedbackId, parsed.data.status);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  // Respond to feedback
  const parsed = respondSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }

  const result = await respondToFeedback(feedbackId, parsed.data.response, admin.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
