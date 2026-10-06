/**
 * Репозиторий комментариев и отзывов поверх MongoDB.
 */

import { getDb, COL, toObjectId } from "@/lib/mongo";
import { ObjectId } from "mongodb";

export interface CommentDoc {
  _id: ObjectId;
  plan_id: string;
  user_id: string;
  text: string;
  parent_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ReviewDoc {
  _id: ObjectId;
  plan_id: string;
  reviewer_id: string;
  rating: number; // 1-5
  feedback: string;
  created_at: Date;
}

export interface CommentRow {
  id: string;
  plan_id: string;
  user_id: string;
  text: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewRow {
  id: string;
  plan_id: string;
  reviewer_id: string;
  rating: number;
  feedback: string;
  created_at: string;
}

export interface UserNameRow {
  id: string;
  fullName: string | null;
  email: string;
}

function toCommentRow(doc: CommentDoc): CommentRow {
  return {
    id: doc._id.toString(),
    plan_id: doc.plan_id,
    user_id: doc.user_id,
    text: doc.text,
    parent_id: doc.parent_id,
    created_at: doc.created_at.toISOString(),
    updated_at: doc.updated_at.toISOString(),
  };
}

function toReviewRow(doc: ReviewDoc): ReviewRow {
  return {
    id: doc._id.toString(),
    plan_id: doc.plan_id,
    reviewer_id: doc.reviewer_id,
    rating: doc.rating,
    feedback: doc.feedback,
    created_at: doc.created_at.toISOString(),
  };
}

/** Добавить комментарий (или ответ, если указан parentId). */
export async function addComment(
  planId: string,
  userId: string,
  text: string,
  parentId?: string | null,
): Promise<CommentRow> {
  const db = await getDb();
  const now = new Date();
  const doc: Omit<CommentDoc, "_id"> = {
    plan_id: planId,
    user_id: userId,
    text,
    parent_id: parentId ?? null,
    created_at: now,
    updated_at: now,
  };
  const result = await db.collection<Omit<CommentDoc, "_id">>(COL.comments).insertOne(doc);
  return {
    id: result.insertedId.toString(),
    plan_id: planId,
    user_id: userId,
    text,
    parent_id: parentId ?? null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}

/** Получить все комментарии для плана (отсортированные по дате). */
export async function getComments(planId: string): Promise<CommentRow[]> {
  const db = await getDb();
  const docs = await db
    .collection<CommentDoc>(COL.comments)
    .find({ plan_id: planId })
    .sort({ created_at: 1 })
    .toArray();
  return docs.map(toCommentRow);
}

/** Удалить свой комментарий. Возвращает true, если удаление произошло. */
export async function deleteComment(commentId: string, userId: string): Promise<boolean> {
  const oid = toObjectId(commentId);
  if (!oid) return false;
  const db = await getDb();
  const result = await db
    .collection<CommentDoc>(COL.comments)
    .deleteOne({ _id: oid, user_id: userId });
  return result.deletedCount > 0;
}

/** Добавить отзыв о плане. */
export async function addReview(
  planId: string,
  reviewerId: string,
  rating: number,
  feedback: string,
): Promise<ReviewRow> {
  const db = await getDb();
  const now = new Date();
  const doc: Omit<ReviewDoc, "_id"> = {
    plan_id: planId,
    reviewer_id: reviewerId,
    rating,
    feedback,
    created_at: now,
  };
  const result = await db.collection<Omit<ReviewDoc, "_id">>(COL.planReviews).insertOne(doc);
  return {
    id: result.insertedId.toString(),
    plan_id: planId,
    reviewer_id: reviewerId,
    rating,
    feedback,
    created_at: now.toISOString(),
  };
}

/** Получить все отзывы для плана (отсортированные по дате, новые сверху). */
export async function getReviews(planId: string): Promise<ReviewRow[]> {
  const db = await getDb();
  const docs = await db
    .collection<ReviewDoc>(COL.planReviews)
    .find({ plan_id: planId })
    .sort({ created_at: -1 })
    .toArray();
  return docs.map(toReviewRow);
}

/** Получить имена пользователей по списку ID (для отображения в комментариях/отзывах). */
export async function getUserNames(userIds: string[]): Promise<Map<string, UserNameRow>> {
  const uniqueIds = [...new Set(userIds)].filter((id) => /^[0-9a-f]{24}$/i.test(id));
  if (uniqueIds.length === 0) return new Map();
  const db = await getDb();
  const oids = uniqueIds.map((id) => new ObjectId(id));
  const docs = await db
    .collection(COL.users)
    .find({ _id: { $in: oids } })
    .project({ full_name: 1, email: 1 })
    .toArray();
  const map = new Map<string, UserNameRow>();
  for (const doc of docs) {
    map.set(doc._id.toString(), {
      id: doc._id.toString(),
      fullName: doc.full_name ?? null,
      email: doc.email,
    });
  }
  return map;
}
