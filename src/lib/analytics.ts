import "server-only";
import { ObjectId } from "mongodb";
import { getDb, COL } from "@/lib/mongo";
import { log } from "@/lib/logger";

export interface AnalyticsEvent {
  _id?: ObjectId;
  user_id: string;
  event: string;
  properties: Record<string, unknown>;
  page?: string;
  timestamp: Date;
  session_id?: string;
}

export interface PageViewEvent {
  user_id: string;
  page: string;
  timestamp: Date;
  session_id?: string;
  referrer?: string;
}

export interface PlanCreatedEvent {
  user_id: string;
  plan_id: string;
  source: "ai" | "template" | "manual" | "clone";
  timestamp: Date;
}

export interface AiGenerationEvent {
  user_id: string;
  type: string;
  success: boolean;
  duration_ms: number;
  timestamp: Date;
}

export interface ExportEvent {
  user_id: string;
  format: "docx" | "pptx" | "html" | "pdf";
  timestamp: Date;
}

export interface ErrorEvent {
  user_id: string;
  error: string;
  context: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Track a generic user event.
 */
export async function trackEvent(
  userId: string,
  event: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  try {
    const db = await getDb();
    const doc: AnalyticsEvent = {
      user_id: userId,
      event,
      properties,
      timestamp: new Date(),
    };
    await db.collection(COL.analyticsEvents).insertOne(doc);
  } catch (error) {
    log.error("Failed to track event", {
      error: error instanceof Error ? error.message : String(error),
      userId,
      event,
    });
  }
}

/**
 * Track a page view.
 */
export async function trackPageView(
  userId: string,
  page: string,
  sessionId?: string,
): Promise<void> {
  try {
    const db = await getDb();
    const doc: PageViewEvent = {
      user_id: userId,
      page,
      timestamp: new Date(),
      session_id: sessionId,
    };
    await db.collection(COL.analyticsEvents).insertOne({
      ...doc,
      event: "page_view",
      properties: { page },
    });
  } catch (error) {
    log.error("Failed to track page view", {
      error: error instanceof Error ? error.message : String(error),
      userId,
      page,
    });
  }
}

/**
 * Track plan creation.
 */
export async function trackPlanCreated(
  userId: string,
  planId: string,
  source: "ai" | "template" | "manual" | "clone",
): Promise<void> {
  try {
    const db = await getDb();
    const doc: PlanCreatedEvent = {
      user_id: userId,
      plan_id: planId,
      source,
      timestamp: new Date(),
    };
    await db.collection(COL.analyticsEvents).insertOne({
      ...doc,
      event: "plan_created",
      properties: { planId, source },
    });
  } catch (error) {
    log.error("Failed to track plan creation", {
      error: error instanceof Error ? error.message : String(error),
      userId,
      planId,
    });
  }
}

/**
 * Track AI generation usage.
 */
export async function trackAiGeneration(
  userId: string,
  type: string,
  success: boolean,
  durationMs: number,
): Promise<void> {
  try {
    const db = await getDb();
    const doc: AiGenerationEvent = {
      user_id: userId,
      type,
      success,
      duration_ms: durationMs,
      timestamp: new Date(),
    };
    await db.collection(COL.analyticsEvents).insertOne({
      ...doc,
      event: "ai_generation",
      properties: { type, success, durationMs },
    });
  } catch (error) {
    log.error("Failed to track AI generation", {
      error: error instanceof Error ? error.message : String(error),
      userId,
      type,
    });
  }
}

/**
 * Track export events.
 */
export async function trackExport(
  userId: string,
  format: "docx" | "pptx" | "html" | "pdf",
): Promise<void> {
  try {
    const db = await getDb();
    const doc: ExportEvent = {
      user_id: userId,
      format,
      timestamp: new Date(),
    };
    await db.collection(COL.analyticsEvents).insertOne({
      ...doc,
      event: "export",
      properties: { format },
    });
  } catch (error) {
    log.error("Failed to track export", {
      error: error instanceof Error ? error.message : String(error),
      userId,
      format,
    });
  }
}

/**
 * Track errors.
 */
export async function trackError(
  userId: string,
  error: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  try {
    const db = await getDb();
    const doc: ErrorEvent = {
      user_id: userId,
      error,
      context,
      timestamp: new Date(),
    };
    await db.collection(COL.analyticsEvents).insertOne({
      ...doc,
      event: "error",
      properties: { error, context },
    });
  } catch (err) {
    log.error("Failed to track error", {
      error: err instanceof Error ? err.message : String(err),
      userId,
    });
  }
}

/**
 * Batch insert events for performance.
 */
export async function trackEventsBatch(
  events: Array<{
    userId: string;
    event: string;
    properties?: Record<string, unknown>;
    page?: string;
  }>,
): Promise<void> {
  if (events.length === 0) return;
  try {
    const db = await getDb();
    const docs = events.map((e) => ({
      user_id: e.userId,
      event: e.event,
      properties: e.properties ?? {},
      page: e.page,
      timestamp: new Date(),
    }));
    await db.collection(COL.analyticsEvents).insertMany(docs);
  } catch (error) {
    log.error("Failed to batch track events", {
      error: error instanceof Error ? error.message : String(error),
      count: events.length,
    });
  }
}

/**
 * Get analytics summary for admin dashboard.
 */
export async function getAnalyticsSummary(days: number = 30) {
  const db = await getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [
    totalEvents,
    pageViews,
    planCreations,
    aiGenerations,
    exports,
    errors,
    dailyActiveUsers,
    topPages,
    topEvents,
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
  ]);

  return {
    totalEvents,
    pageViews,
    planCreations,
    aiGenerations,
    exports,
    errors,
    dailyActiveUsers,
    topPages,
    topEvents,
  };
}

/**
 * Get usage over time for charts.
 */
export async function getUsageOverTime(days: number = 30) {
  const db = await getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const daily = await db.collection(COL.analyticsEvents).aggregate<{
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
  ]).toArray();

  return daily;
}

/**
 * Get error rate over time.
 */
export async function getErrorRates(days: number = 30) {
  const db = await getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rates = await db.collection(COL.analyticsEvents).aggregate<{
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
  ]).toArray();

  return rates;
}

/**
 * Get user engagement metrics.
 */
export async function getEngagementMetrics(days: number = 30) {
  const db = await getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

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
}
