import "server-only";
import { ObjectId } from "mongodb";
import { COL, getClient, getDb, toObjectId } from "@/lib/mongo";
import type { PlanDoc } from "@/lib/plans-repo";
import { PLAN_CONFLICT, PLAN_VERSION_SECTIONS, isBoundedPlan, type PlanSection } from "@/lib/plan-versions";
import { requireSchoolAccess, type SchoolMemberDoc } from "@/lib/school";
import { getAssignedSchoolClassNames } from "@/lib/school-permissions";
import { hasSchoolPermission, type SchoolRole } from "@/lib/school/role-matrix";

export type SchoolApprovalStatus = "submitted" | "in_review" | "changes_requested" | "resubmitted" | "approved";
export type SchoolApprovalAction = "submitted" | "review_started" | "commented" | "changes_requested" | "resubmitted" | "approved";

export interface ApprovalSnapshot {
  school_class_name: string;
  title: string;
  subject_id: string | null;
  grade: number;
  quarter: number | null;
  section: string | null;
  class_id: string | null;
  content: PlanDoc["content"];
  visibility: PlanDoc["visibility"];
  language: PlanDoc["language"];
  updated_at: string;
}

export interface SchoolApprovalEvent {
  action: SchoolApprovalAction;
  actor_id: string;
  actor_role: SchoolRole;
  created_at: Date;
  comment?: string;
  section?: PlanSection;
}

export interface SchoolApprovalCycleDoc {
  _id?: ObjectId;
  school_id: string;
  plan_id: string;
  owner_id: string;
  cycle: number;
  status: SchoolApprovalStatus;
  version_updated_at: Date;
  snapshot_hash: string;
  snapshot: ApprovalSnapshot;
  events: SchoolApprovalEvent[];
  submitted_at: Date;
  updated_at: Date;
}

export interface SchoolApprovalCycleView {
  id: string;
  school_id: string;
  plan_id: string;
  owner_id: string;
  cycle: number;
  status: SchoolApprovalStatus;
  version_updated_at: string;
  snapshot_hash: string;
  snapshot: ApprovalSnapshot;
  events: Array<Omit<SchoolApprovalEvent, "created_at"> & { created_at: string }>;
  submitted_at: string;
  updated_at: string;
}

export interface SchoolApprovalQueueItem {
  id: string;
  plan_id: string;
  owner_id: string;
  school_class_name: string;
  cycle: number;
  status: SchoolApprovalStatus;
  title: string;
  subject_id: string | null;
  grade: number;
  submitted_at: string;
  updated_at: string;
}

export const APPROVAL_VERSION_CHANGED = "APPROVAL_VERSION_CHANGED";
const ACTIVE_REVIEW_STATUSES: SchoolApprovalStatus[] = ["submitted", "in_review", "resubmitted"];

function toView(doc: SchoolApprovalCycleDoc): SchoolApprovalCycleView {
  return {
    id: doc._id?.toString() ?? "",
    school_id: doc.school_id,
    plan_id: doc.plan_id,
    owner_id: doc.owner_id,
    cycle: doc.cycle,
    status: doc.status,
    version_updated_at: doc.version_updated_at.toISOString(),
    snapshot_hash: doc.snapshot_hash,
    snapshot: { ...doc.snapshot, school_class_name: doc.snapshot.school_class_name ?? "" },
    events: doc.events.map((event) => ({ ...event, created_at: event.created_at.toISOString() })),
    submitted_at: doc.submitted_at.toISOString(),
    updated_at: doc.updated_at.toISOString(),
  };
}

async function hashSnapshot(snapshot: ApprovalSnapshot): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function makeSnapshot(plan: PlanDoc, schoolClassName: string): ApprovalSnapshot {
  return {
    school_class_name: schoolClassName,
    title: plan.title,
    subject_id: plan.subject_id,
    grade: plan.grade,
    quarter: plan.quarter,
    section: plan.section,
    class_id: plan.class_id ?? null,
    content: plan.content,
    visibility: plan.visibility,
    language: plan.language,
    updated_at: plan.updated_at.toISOString(),
  };
}

export async function createApprovalCycle(
  actorId: string,
  schoolId: string,
  planId: string,
  schoolClassName: string,
  expectedUpdatedAt: string,
  mode: "submit" | "resubmit",
): Promise<SchoolApprovalCycleView> {
  const normalizedClass = schoolClassName.trim();
  if (!normalizedClass || normalizedClass.length > 50) throw new Error("Invalid school class");
  const oid = toObjectId(planId);
  if (!oid) throw new Error("Plan not found");
  const db = await getDb();
  const session = (await getClient()).startSession();
  let created: SchoolApprovalCycleDoc | null = null;
  try {
    await session.withTransaction(async () => {
      const member = await db.collection<SchoolMemberDoc>(COL.schoolMembers).findOne({ school_id: schoolId, user_id: actorId }, { session });
      if (!member) throw new Error("Access denied: school membership required");
      const allClassRead = hasSchoolPermission(member.role, member.granted_permissions, "school:students:read_all");
      const assignedClassRead = hasSchoolPermission(member.role, member.granted_permissions, "school:students:read_assigned");
      if (!allClassRead && !assignedClassRead) throw new Error("Access denied: school class access required");
      const activeClass = await db.collection(COL.students).findOne({ school_id: schoolId, class_name: normalizedClass, status: "active" }, { projection: { _id: 1 }, session });
      if (!activeClass) throw new Error("Invalid school class");
      if (!allClassRead) {
        const assignment = await db.collection(COL.schoolClassAssignments).findOne({ school_id: schoolId, teacher_id: actorId, class_name: normalizedClass, active: true }, { projection: { _id: 1 }, session });
        if (!assignment) throw new Error("Access denied: class is not assigned");
      }

      const plan = await db.collection<PlanDoc>(COL.plans).findOne({ _id: oid, owner_id: actorId }, { session });
      if (!plan) throw new Error("Plan not found");
      if (plan.is_draft) throw new Error("Save the plan before submitting it for school review");
      if (typeof expectedUpdatedAt !== "string" || expectedUpdatedAt !== plan.updated_at.toISOString()) throw new Error(PLAN_CONFLICT);

      const collection = db.collection<SchoolApprovalCycleDoc>(COL.schoolPlanApprovals);
      const previous = await collection.find({ school_id: schoolId, plan_id: planId, owner_id: actorId }, { session })
        .sort({ cycle: -1 }).limit(1).next();
      if (mode === "resubmit") {
        if (previous?.status !== "changes_requested") throw new Error("Only a returned plan can be resubmitted");
        if (previous.version_updated_at.getTime() === plan.updated_at.getTime()) throw new Error("Edit the plan before resubmitting it");
      } else if (previous && previous.status !== "approved") {
        throw new Error("This plan already has an active school review");
      } else if (previous && previous.version_updated_at.getTime() === plan.updated_at.getTime()) {
        throw new Error("This plan version has already been approved");
      }

      const snapshot = makeSnapshot(plan, normalizedClass);
      if (!isBoundedPlan(snapshot)) throw new Error("Plan snapshot is too large for school review");
      const now = new Date();
      const status: SchoolApprovalStatus = mode === "resubmit" ? "resubmitted" : "submitted";
      const doc: SchoolApprovalCycleDoc = {
        school_id: schoolId,
        plan_id: planId,
        owner_id: actorId,
        cycle: (previous?.cycle ?? 0) + 1,
        status,
        version_updated_at: plan.updated_at,
        snapshot_hash: await hashSnapshot(snapshot),
        snapshot,
        events: [{ action: mode === "resubmit" ? "resubmitted" : "submitted", actor_id: actorId, actor_role: member.role, created_at: now }],
        submitted_at: now,
        updated_at: now,
      };
      const inserted = await collection.insertOne(doc, { session });
      const guarded = await db.collection<PlanDoc>(COL.plans).updateOne(
        { _id: oid, owner_id: actorId, updated_at: plan.updated_at },
        { $set: { last_approval_cycle_id: inserted.insertedId.toString() } },
        { session },
      );
      if (guarded.matchedCount !== 1) throw new Error(PLAN_CONFLICT);
      created = { ...doc, _id: inserted.insertedId };
    });
  } finally {
    await session.endSession();
  }
  if (!created) throw new Error("Unable to create school approval cycle");
  return toView(created);
}

export async function getApprovalCyclesForPlan(
  viewerId: string,
  schoolId: string,
  planId: string,
): Promise<SchoolApprovalCycleView[]> {
  const oid = toObjectId(planId);
  if (!oid) throw new Error("Plan not found");
  const db = await getDb();
  const plan = await db.collection<PlanDoc>(COL.plans).findOne({ _id: oid }, { projection: { owner_id: 1 } });
  if (!plan) throw new Error("Plan not found");
  if (plan.owner_id !== viewerId) {
    const member = await requireSchoolAccess(viewerId, schoolId);
    const canReadAll = hasSchoolPermission(member.role, member.granted_permissions, "school:plans:read_all")
      || hasSchoolPermission(member.role, member.granted_permissions, "school:plans:review");
    if (!canReadAll && !hasSchoolPermission(member.role, member.granted_permissions, "school:plans:comment_assigned")) {
      throw new Error("Access denied: school plan review permission required");
    }
    if (!canReadAll) {
      const classes = await getAssignedSchoolClassNames(schoolId, viewerId);
      if (!classes.length) return [];
      const docs = await db.collection<SchoolApprovalCycleDoc>(COL.schoolPlanApprovals)
        .find({ school_id: schoolId, plan_id: planId, owner_id: plan.owner_id, "snapshot.school_class_name": { $in: classes } })
        .sort({ cycle: 1 }).toArray();
      return docs.map(toView);
    }
  }
  const docs = await db.collection<SchoolApprovalCycleDoc>(COL.schoolPlanApprovals)
    .find({ school_id: schoolId, plan_id: planId, owner_id: plan.owner_id }).sort({ cycle: 1 }).toArray();
  return docs.map(toView);
}

export async function getApprovalCycleForViewer(
  viewerId: string,
  schoolId: string,
  cycleId: string,
): Promise<SchoolApprovalCycleView> {
  const oid = toObjectId(cycleId);
  if (!oid) throw new Error("Review cycle not found");
  const db = await getDb();
  const cycle = await db.collection<SchoolApprovalCycleDoc>(COL.schoolPlanApprovals).findOne({ _id: oid, school_id: schoolId });
  if (!cycle) throw new Error("Review cycle not found");
  if (cycle.owner_id !== viewerId) {
    const member = await requireSchoolAccess(viewerId, schoolId);
    const canReadAll = hasSchoolPermission(member.role, member.granted_permissions, "school:plans:read_all")
      || hasSchoolPermission(member.role, member.granted_permissions, "school:plans:review");
    if (!canReadAll) {
      if (!hasSchoolPermission(member.role, member.granted_permissions, "school:plans:comment_assigned")) throw new Error("Access denied: school plan review permission required");
      const classes = await getAssignedSchoolClassNames(schoolId, viewerId);
      if (!classes.includes(cycle.snapshot.school_class_name)) throw new Error("Access denied: plan class is not assigned");
    }
  }
  return toView(cycle);
}

export async function getSchoolApprovalQueue(viewerId: string, schoolId: string): Promise<SchoolApprovalQueueItem[]> {
  const member = await requireSchoolAccess(viewerId, schoolId);
  const canReview = hasSchoolPermission(member.role, member.granted_permissions, "school:plans:review");
  const canCommentAssigned = hasSchoolPermission(member.role, member.granted_permissions, "school:plans:comment_assigned");
  if (!canReview && !canCommentAssigned) throw new Error("Access denied: school plan review permission required");
  const db = await getDb();
  const assignedClasses = canReview ? undefined : await getAssignedSchoolClassNames(schoolId, viewerId);
  if (assignedClasses && assignedClasses.length === 0) return [];
  const docs = await db.collection<SchoolApprovalCycleDoc>(COL.schoolPlanApprovals)
    .find({ school_id: schoolId, status: { $in: ACTIVE_REVIEW_STATUSES }, ...(assignedClasses ? { "snapshot.school_class_name": { $in: assignedClasses } } : {}) })
    .sort({ submitted_at: 1, _id: 1 }).limit(200).toArray();
  return docs.map((doc) => ({
    id: doc._id?.toString() ?? "",
    plan_id: doc.plan_id,
    owner_id: doc.owner_id,
    school_class_name: doc.snapshot.school_class_name ?? "",
    cycle: doc.cycle,
    status: doc.status,
    title: doc.snapshot.title,
    subject_id: doc.snapshot.subject_id,
    grade: doc.snapshot.grade,
    submitted_at: doc.submitted_at.toISOString(),
    updated_at: doc.updated_at.toISOString(),
  }));
}

export async function transitionApprovalCycle(
  actorId: string,
  schoolId: string,
  cycleId: string,
  action: "review" | "comment" | "request_changes" | "approve",
  input: { comment?: string; section?: PlanSection },
): Promise<SchoolApprovalCycleView> {
  const oid = toObjectId(cycleId);
  if (!oid) throw new Error("Review cycle not found");
  const db = await getDb();
  const collection = db.collection<SchoolApprovalCycleDoc>(COL.schoolPlanApprovals);
  const cycle = await collection.findOne({ _id: oid, school_id: schoolId });
  if (!cycle) throw new Error("Review cycle not found");
  if (cycle.owner_id === actorId) throw new Error("Access denied: authors cannot review or approve their own plan");
  const actor = await requireSchoolAccess(actorId, schoolId);
  const canReview = hasSchoolPermission(actor.role, actor.granted_permissions, "school:plans:review");
  const canApprove = hasSchoolPermission(actor.role, actor.granted_permissions, "school:plans:approve") && actor.role !== "admin";
  const canCommentAssigned = action === "comment" && hasSchoolPermission(actor.role, actor.granted_permissions, "school:plans:comment_assigned");
  if (action === "approve" && !canApprove) throw new Error("Access denied: plan approval permission required");
  if (action !== "approve" && action !== "comment" && !canReview) throw new Error("Access denied: plan review permission required");
  if (action === "comment" && !canReview && canCommentAssigned) {
    const assignedClasses = await getAssignedSchoolClassNames(schoolId, actorId);
    if (!assignedClasses.includes(cycle.snapshot.school_class_name)) throw new Error("Access denied: plan class is not assigned");
  } else if (action === "comment" && !canReview) {
    throw new Error("Access denied: school plan comment permission required");
  }
  if ((action === "comment" || action === "request_changes") && !input.section) throw new Error("Choose a plan section for this comment");
  if (action === "request_changes" && !input.comment?.trim()) throw new Error("Add a comment explaining the requested changes");
  if (input.comment && input.comment.length > 2000) throw new Error("Comment is too long");

  let nextStatus = cycle.status;
  let eventAction: SchoolApprovalAction;
  if (action === "review") {
    if (cycle.status !== "submitted" && cycle.status !== "resubmitted") throw new Error("This review cannot be started in the current state");
    nextStatus = "in_review";
    eventAction = "review_started";
  } else if (action === "request_changes") {
    if (cycle.status !== "in_review") throw new Error("Changes can only be requested while the plan is in review");
    nextStatus = "changes_requested";
    eventAction = "changes_requested";
  } else if (action === "approve") {
    if (cycle.status !== "in_review") throw new Error("Only a plan in review can be approved");
    const planOid = toObjectId(cycle.plan_id);
    const current = planOid ? await db.collection<PlanDoc>(COL.plans).findOne({ _id: planOid, owner_id: cycle.owner_id }, { projection: { updated_at: 1 } }) : null;
    if (!current || current.updated_at.getTime() !== cycle.version_updated_at.getTime()) throw new Error(APPROVAL_VERSION_CHANGED);
    nextStatus = "approved";
    eventAction = "approved";
  } else {
    if (canReview && cycle.status !== "in_review") throw new Error("Comments can only be added while the plan is in review");
    if (!canReview && cycle.status !== "submitted" && cycle.status !== "resubmitted" && cycle.status !== "in_review") throw new Error("Comments can only be added to an active review");
    eventAction = "commented";
  }

  if (input.section && !(PLAN_VERSION_SECTIONS as readonly string[]).includes(input.section)) throw new Error("Invalid plan section");
  const now = new Date();
  const event: SchoolApprovalEvent = {
    action: eventAction,
    actor_id: actorId,
    actor_role: actor.role,
    created_at: now,
    ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}),
    ...(input.section ? { section: input.section } : {}),
  };
  const updated = await collection.updateOne(
    { _id: oid, school_id: schoolId, status: cycle.status, updated_at: cycle.updated_at },
    { $set: { status: nextStatus, updated_at: now }, $push: { events: event } },
  );
  if (updated.matchedCount !== 1) throw new Error("This review changed in another session. Refresh and try again.");
  const latest = await collection.findOne({ _id: oid, school_id: schoolId });
  if (!latest) throw new Error("Review cycle not found");
  return toView(latest);
}
