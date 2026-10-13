import "server-only";
import type { ObjectId, Filter } from "mongodb";
import { COL, getDb, toObjectId } from "@/lib/mongo";
import { hasSchoolPermission } from "@/lib/school/role-matrix";
import type { SchoolMemberDoc } from "@/lib/school";
import type { AppNotificationKind, AppNotificationView } from "@/lib/notification-types";
export type { AppNotificationKind, AppNotificationView } from "@/lib/notification-types";

export interface AppNotificationDoc {
  _id?: ObjectId;
  user_id: string;
  kind: AppNotificationKind;
  href: string;
  dedupe_key: string;
  school_id?: string;
  created_at: Date;
  read_at?: Date | null;
}

interface PendingNotification {
  user_id: string;
  kind: AppNotificationKind;
  href: string;
  dedupe_key: string;
  school_id?: string;
  created_at?: Date;
}

function validInternalHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//") && !/[\u0000-\u001f\\]/u.test(href);
}

/** Upserts make retries harmless; records contain no student names, answers, or scores. */
export async function enqueueNotifications(pending: PendingNotification[]): Promise<void> {
  const docs = pending.filter((item) => item.user_id && item.dedupe_key && validInternalHref(item.href));
  if (!docs.length) return;
  try {
    const db = await getDb();
    await db.collection<AppNotificationDoc>(COL.notifications).bulkWrite(docs.map((item) => ({
      updateOne: {
        filter: { user_id: item.user_id, dedupe_key: item.dedupe_key },
        update: { $setOnInsert: { ...item, created_at: item.created_at ?? new Date(), read_at: null } },
        upsert: true,
      },
    })), { ordered: false });
  } catch {
    // Notification delivery is best effort and must not roll back the user's
    // already-committed plan or assignment action.
    console.error("[notifications] Failed to store in-app notification batch");
  }
}

export async function enqueueSchoolReviewNeeded(
  schoolId: string,
  planId: string,
  cycleId: string,
  eventIndex: number,
  authorId: string,
): Promise<void> {
  const db = await getDb();
  const members = await db.collection<SchoolMemberDoc>(COL.schoolMembers).find({ school_id: schoolId }).toArray();
  const href = `/school/approvals/${encodeURIComponent(planId)}?school=${encodeURIComponent(schoolId)}&cycle=${encodeURIComponent(cycleId)}`;
  await enqueueNotifications(members
    .filter((member) => member.user_id !== authorId && (
      hasSchoolPermission(member.role, member.granted_permissions, "school:plans:review")
      || hasSchoolPermission(member.role, member.granted_permissions, "school:plans:approve")
    ))
    .map((member) => ({
      user_id: member.user_id,
      kind: "school_review_needed" as const,
      href,
      school_id: schoolId,
      dedupe_key: `approval:${cycleId}:event:${eventIndex}`,
    })));
}

export async function enqueueApprovalOwnerNotice(
  ownerId: string,
  schoolId: string,
  planId: string,
  cycleId: string,
  eventIndex: number,
  kind: "school_comment" | "school_approval_update",
): Promise<void> {
  await enqueueNotifications([{
    user_id: ownerId,
    kind,
    href: `/school/approvals/${encodeURIComponent(planId)}?school=${encodeURIComponent(schoolId)}&cycle=${encodeURIComponent(cycleId)}`,
    school_id: schoolId,
    dedupe_key: `approval:${cycleId}:event:${eventIndex}`,
  }]);
}

export async function listNotifications(userId: string): Promise<{ notifications: AppNotificationView[]; unreadCount: number }> {
  const db = await getDb();
  const collection = db.collection<AppNotificationDoc>(COL.notifications);
  const [docs, unreadCount] = await Promise.all([
    collection.find({ user_id: userId }).sort({ created_at: -1, _id: -1 }).limit(100).toArray(),
    collection.countDocuments({ user_id: userId, read_at: null }),
  ]);
  return {
    notifications: docs.flatMap((doc) => doc._id ? [{
      id: doc._id.toHexString(),
      kind: doc.kind,
      href: validInternalHref(doc.href) ? doc.href : "/notifications",
      created_at: doc.created_at.toISOString(),
      read_at: doc.read_at?.toISOString() ?? null,
    }] : []),
    unreadCount,
  };
}

export async function markNotificationsRead(userId: string, ids?: string[]): Promise<void> {
  const db = await getDb();
  const collection = db.collection<AppNotificationDoc>(COL.notifications);
  const filter: Filter<AppNotificationDoc> = { user_id: userId, read_at: null };
  if (ids) filter._id = { $in: ids.map(toObjectId).filter((id): id is NonNullable<typeof id> => id !== null) };
  await collection.updateMany(filter, { $set: { read_at: new Date() } });
}
