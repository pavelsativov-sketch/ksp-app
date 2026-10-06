import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, COL, isMongoConfigured } from "@/lib/mongo";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/admin/auth";
import { trackEventsBatch } from "@/lib/analytics";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const eventSchema = z.object({
  event: z.string().min(1).max(100),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
  page: z.string().max(200).optional(),
  timestamp: z.string().datetime().optional(),
});

const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(50),
});

/**
 * POST /api/analytics — приём событий аналитики от клиента.
 * События батчатся для производительности.
 */
export async function POST(request: Request) {
  if (!isMongoConfigured()) {
    return NextResponse.json({ ok: true });
  }

  const user = await getCurrentUser();
  const userId = user?.id ?? "anonymous";

  const rl = await checkRateLimitAsync(`analytics:post:${clientIp(request)}`, 120, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const events = parsed.data.events.map((e) => ({
    userId,
    event: e.event,
    properties: e.properties,
    page: e.page,
  }));

  await trackEventsBatch(events);

  return NextResponse.json({ ok: true, received: events.length });
}

/**
 * GET /api/analytics — получение данных аналитики (только для администраторов).
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
  const days = Math.min(365, Math.max(1, Number(searchParams.get("days")) || 30));

  const db = await getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [
    totalEvents,
    pageViews,
    planCreations,
    aiGenerations,
    exportsCount,
    errors,
    dailyActiveUsers,
    topPages,
    topEvents,
    usageOverTime,
    errorRates,
    engagement,
  ] = await Promise.all([
    db.collection(COL.analyticsEvents).countDocuments({ timestamp: { $gte: since } }),
    db.collection(COL.analyticsEvents).countDocuments({ event: "page_view", timestamp: { $gte: since } }),
    db.collection(COL.analyticsEvents).countDocuments({ event: "plan_created", timestamp: { $gte: since } }),
    db.collection(COL.analyticsEvents).countDocuments({ event: "ai_generation", timestamp: { $gte: since } }),
    db.collection(COL.analyticsEvents).countDocuments({ event: "export", timestamp: { $gte: since } }),
    db.collection(COL.analyticsEvents).countDocuments({ event: "error", timestamp: { $gte: since } }),
    db.collection(COL.analyticsEvents).aggregate<{ _id: string; count: number }>([
      { $match: { timestamp: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }, count: { $addToSet: "$user_id" } } },
      { $project: { count: { $size: "$count" } } },
      { $sort: { _id: 1 } },
    ]).toArray(),
    db.collection(COL.analyticsEvents).aggregate<{ _id: string; count: number }>([
      { $match: { event: "page_view", timestamp: { $gte: since } } },
      { $group: { _id: "$properties.page", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]).toArray(),
    db.collection(COL.analyticsEvents).aggregate<{ _id: string; count: number }>([
      { $match: { timestamp: { $gte: since } } },
      { $group: { _id: "$event", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]).toArray(),
    db.collection(COL.analyticsEvents).aggregate<{
      _id: string;
      pageViews: number;
      planCreations: number;
      aiGenerations: number;
      exports: number;
      errors: number;
    }>([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
          pageViews: { $sum: { $cond: [{ $eq: ["$event", "page_view"] }, 1, 0] } },
          planCreations: { $sum: { $cond: [{ $eq: ["$event", "plan_created"] }, 1, 0] } },
          aiGenerations: { $sum: { $cond: [{ $eq: ["$event", "ai_generation"] }, 1, 0] } },
          exports: { $sum: { $cond: [{ $eq: ["$event", "export"] }, 1, 0] } },
          errors: { $sum: { $cond: [{ $eq: ["$event", "error"] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]).toArray(),
    db.collection(COL.analyticsEvents).aggregate<{
      _id: string;
      total: number;
      errors: number;
      errorRate: number;
    }>([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
          total: { $sum: 1 },
          errors: { $sum: { $cond: [{ $eq: ["$event", "error"] }, 1, 0] } },
        },
      },
      { $project: { errorRate: { $multiply: [{ $divide: ["$errors", "$total"] }, 100] } } },
      { $sort: { _id: 1 } },
    ]).toArray(),
    (async () => {
      const [avgEventsPerUser, avgSessionDuration, returningUsers] = await Promise.all([
        db.collection(COL.analyticsEvents).aggregate<{ _id: null; avg: number }>([
          { $match: { timestamp: { $gte: since } } },
          { $group: { _id: "$user_id", count: { $sum: 1 } } },
          { $group: { _id: null, avg: { $avg: "$count" } } },
        ]).toArray(),
        db.collection(COL.analyticsEvents).aggregate<{ _id: null; avgDuration: number }>([
          { $match: { event: "page_view", timestamp: { $gte: since } } },
          { $group: { _id: "$user_id", first: { $min: "$timestamp" }, last: { $max: "$timestamp" } } },
          { $project: { duration: { $subtract: ["$last", "$first"] } } },
          { $group: { _id: null, avgDuration: { $avg: "$duration" } } },
        ]).toArray(),
        db.collection(COL.analyticsEvents).aggregate<{ returning: number }>([
          { $match: { timestamp: { $gte: since } } },
          { $group: { _id: "$user_id", daysActive: { $addToSet: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } } } } },
          { $project: { daysActive: { $size: "$daysActive" } } },
          { $match: { daysActive: { $gt: 1 } } },
          { $count: "returning" },
        ]).toArray(),
      ]);
      return {
        avgEventsPerUser: Math.round(avgEventsPerUser[0]?.avg ?? 0),
        avgSessionDurationMs: Math.round(avgSessionDuration[0]?.avgDuration ?? 0),
        returningUsers: returningUsers[0]?.returning ?? 0,
      };
    })(),
  ]);

  return NextResponse.json({
    summary: {
      totalEvents,
      pageViews,
      planCreations,
      aiGenerations,
      exports: exportsCount,
      errors,
    },
    dailyActiveUsers,
    topPages,
    topEvents,
    usageOverTime,
    errorRates,
    engagement,
  });
}
