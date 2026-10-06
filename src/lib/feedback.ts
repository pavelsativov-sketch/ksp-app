import "server-only";
import { ObjectId } from "mongodb";
import { getDb, COL, toObjectId } from "@/lib/mongo";
import { log } from "@/lib/logger";

export type FeedbackCategory = "bug" | "feature" | "general";
export type FeedbackStatus = "new" | "in_progress" | "resolved" | "closed";

export interface FeedbackDoc {
  _id?: ObjectId;
  user_id: string;
  rating: number;
  comment: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  response?: string;
  responded_by?: string;
  responded_at?: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Submit feedback from a user.
 */
export async function submitFeedback(
  userId: string,
  rating: number,
  comment: string,
  category: FeedbackCategory,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    if (rating < 1 || rating > 5) {
      return { ok: false, error: "Rating must be between 1 and 5" };
    }
    if (comment.length > 5000) {
      return { ok: false, error: "Comment is too long" };
    }

    const db = await getDb();
    const now = new Date();
    const doc: Omit<FeedbackDoc, "_id"> = {
      user_id: userId,
      rating,
      comment,
      category,
      status: "new",
      created_at: now,
      updated_at: now,
    };
    const result = await db.collection(COL.feedback).insertOne(doc);
    return { ok: true, id: result.insertedId.toString() };
  } catch (error) {
    log.error("Failed to submit feedback", {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    return { ok: false, error: "Failed to submit feedback" };
  }
}

/**
 * Get all feedback (admin only).
 */
export async function getFeedback(
  adminId: string,
  options: {
    status?: FeedbackStatus;
    category?: FeedbackCategory;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ feedback: FeedbackDoc[]; total: number }> {
  try {
    const db = await getDb();
    const { status, category, limit = 50, offset = 0 } = options;

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (category) filter.category = category;

    const [feedback, total] = await Promise.all([
      db
        .collection<FeedbackDoc>(COL.feedback)
        .find(filter)
        .sort({ created_at: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      db.collection(COL.feedback).countDocuments(filter),
    ]);

    return { feedback, total };
  } catch (error) {
    log.error("Failed to get feedback", {
      error: error instanceof Error ? error.message : String(error),
      adminId,
    });
    return { feedback: [], total: 0 };
  }
}

/**
 * Respond to feedback (admin only).
 */
export async function respondToFeedback(
  feedbackId: string,
  response: string,
  adminId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const oid = toObjectId(feedbackId);
    if (!oid) {
      return { ok: false, error: "Invalid feedback ID" };
    }

    const db = await getDb();
    const result = await db.collection(COL.feedback).updateOne(
      { _id: oid } as Record<string, unknown>,
      {
        $set: {
          response,
          responded_by: adminId,
          responded_at: new Date(),
          status: "in_progress",
          updated_at: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return { ok: false, error: "Feedback not found" };
    }

    return { ok: true };
  } catch (error) {
    log.error("Failed to respond to feedback", {
      error: error instanceof Error ? error.message : String(error),
      feedbackId,
      adminId,
    });
    return { ok: false, error: "Failed to respond to feedback" };
  }
}

/**
 * Update feedback status (admin only).
 */
export async function updateFeedbackStatus(
  feedbackId: string,
  status: FeedbackStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const oid = toObjectId(feedbackId);
    if (!oid) {
      return { ok: false, error: "Invalid feedback ID" };
    }

    const db = await getDb();
    const result = await db.collection(COL.feedback).updateOne(
      { _id: oid } as Record<string, unknown>,
      { $set: { status, updated_at: new Date() } },
    );

    if (result.matchedCount === 0) {
      return { ok: false, error: "Feedback not found" };
    }

    return { ok: true };
  } catch (error) {
    log.error("Failed to update feedback status", {
      error: error instanceof Error ? error.message : String(error),
      feedbackId,
    });
    return { ok: false, error: "Failed to update feedback status" };
  }
}

/**
 * Get feedback statistics for admin dashboard.
 */
export async function getFeedbackStats(): Promise<{
  total: number;
  averageRating: number;
  byCategory: Record<FeedbackCategory, number>;
  byStatus: Record<FeedbackStatus, number>;
}> {
  try {
    const db = await getDb();
    const [total, avgRating, byCategory, byStatus] = await Promise.all([
      db.collection(COL.feedback).countDocuments(),
      db.collection(COL.feedback).aggregate<{ _id: null; avg: number }>([
        { $group: { _id: null, avg: { $avg: "$rating" } } },
      ]).toArray(),
      db.collection(COL.feedback).aggregate<{ _id: FeedbackCategory; count: number }>([
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]).toArray(),
      db.collection(COL.feedback).aggregate<{ _id: FeedbackStatus; count: number }>([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]).toArray(),
    ]);

    const categoryMap: Record<FeedbackCategory, number> = { bug: 0, feature: 0, general: 0 };
    for (const row of byCategory) {
      categoryMap[row._id] = row.count;
    }

    const statusMap: Record<FeedbackStatus, number> = { new: 0, in_progress: 0, resolved: 0, closed: 0 };
    for (const row of byStatus) {
      statusMap[row._id] = row.count;
    }

    return {
      total,
      averageRating: Math.round((avgRating[0]?.avg ?? 0) * 10) / 10,
      byCategory: categoryMap,
      byStatus: statusMap,
    };
  } catch (error) {
    log.error("Failed to get feedback stats", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      total: 0,
      averageRating: 0,
      byCategory: { bug: 0, feature: 0, general: 0 },
      byStatus: { new: 0, in_progress: 0, resolved: 0, closed: 0 },
    };
  }
}
