import "server-only";
import { ObjectId } from "mongodb";
import { getClient, getDb, COL } from "@/lib/mongo";
import { getSchoolClasses, requireSchoolAccess, type SchoolMemberDoc } from "@/lib/school";
import {
  hasSchoolPermission,
  SCHOOL_ADMIN_FORBIDDEN_PERMISSIONS,
  type SchoolPermission,
  type SchoolRole,
} from "@/lib/school/role-matrix";

export interface SchoolClassAssignmentDoc {
  _id?: ObjectId;
  school_id: string;
  teacher_id: string;
  class_name: string;
  active: boolean;
  assigned_by: string;
  assigned_at: Date;
  created_at: Date;
  revoked_by?: string;
  revoked_at?: Date;
}

export async function requireSchoolPermission(
  userId: string,
  schoolId: string,
  permission: SchoolPermission,
): Promise<SchoolMemberDoc> {
  const member = await requireSchoolAccess(userId, schoolId);
  if (!hasSchoolPermission(member.role, member.granted_permissions, permission)) {
    throw new Error(`Access denied: missing ${permission}`);
  }
  return member;
}

export async function getAssignedSchoolClassNames(schoolId: string, teacherId: string): Promise<string[]> {
  const db = await getDb();
  const assignments = await db.collection<SchoolClassAssignmentDoc>(COL.schoolClassAssignments)
    .find({ school_id: schoolId, teacher_id: teacherId, active: true })
    .project<{ class_name: string }>({ class_name: 1, _id: 0 })
    .toArray();
  return [...new Set(assignments.map((item) => item.class_name))].sort((a, b) => a.localeCompare(b, "kk", { numeric: true }));
}

export async function getVisibleSchoolClassNames(userId: string, schoolId: string): Promise<string[]> {
  const member = await requireSchoolAccess(userId, schoolId);
  if (hasSchoolPermission(member.role, member.granted_permissions, "school:students:read_all")) {
    return getSchoolClasses(schoolId);
  }
  if (hasSchoolPermission(member.role, member.granted_permissions, "school:students:read_assigned")) {
    return getAssignedSchoolClassNames(schoolId, userId);
  }
  return [];
}

export async function requireSchoolClassAccess(
  userId: string,
  schoolId: string,
  className: string,
  action: "read" | "write",
): Promise<SchoolMemberDoc> {
  const member = await requireSchoolAccess(userId, schoolId);
  const allPermission = action === "read" ? "school:students:read_all" : "school:students:write_all";
  if (hasSchoolPermission(member.role, member.granted_permissions, allPermission)) return member;

  const assignedPermission = action === "read" ? "school:students:read_assigned" : "school:students:write_assigned";
  if (!hasSchoolPermission(member.role, member.granted_permissions, assignedPermission)) {
    throw new Error(`Access denied: missing ${assignedPermission}`);
  }
  const db = await getDb();
  const assignment = await db.collection<SchoolClassAssignmentDoc>(COL.schoolClassAssignments).findOne({
    school_id: schoolId,
    teacher_id: userId,
    class_name: className,
    active: true,
  });
  if (!assignment) throw new Error("Access denied: class is not assigned");
  return member;
}

export async function getSchoolClassAssignmentsForViewer(userId: string, schoolId: string): Promise<SchoolClassAssignmentDoc[]> {
  const member = await requireSchoolAccess(userId, schoolId);
  const canManage = hasSchoolPermission(member.role, member.granted_permissions, "school:classes:manage");
  const canReadAssigned = hasSchoolPermission(member.role, member.granted_permissions, "school:students:read_assigned");
  if (canManage) {
    const db = await getDb();
    return db.collection<SchoolClassAssignmentDoc>(COL.schoolClassAssignments)
      .find({ school_id: schoolId, active: true }).sort({ class_name: 1, teacher_id: 1 }).toArray();
  }
  if (!canReadAssigned) return [];
  const db = await getDb();
  return db.collection<SchoolClassAssignmentDoc>(COL.schoolClassAssignments)
    .find({ school_id: schoolId, teacher_id: userId, active: true }).sort({ class_name: 1 }).toArray();
}

export async function assignSchoolClass(
  actorId: string,
  schoolId: string,
  teacherId: string,
  className: string,
): Promise<void> {
  await requireSchoolPermission(actorId, schoolId, "school:classes:manage");
  const normalizedClass = className.trim();
  if (!normalizedClass || !(await getSchoolClasses(schoolId)).includes(normalizedClass)) {
    throw new Error("Invalid school class");
  }
  const db = await getDb();
  const target = await db.collection<SchoolMemberDoc>(COL.schoolMembers).findOne({ school_id: schoolId, user_id: teacherId });
  if (!target || !["teacher", "admin"].includes(target.role)) throw new Error("Invalid class assignment target");
  if (target.role === "admin" && !hasSchoolPermission(target.role, target.granted_permissions, "school:students:read_assigned")) {
    throw new Error("Admin must first receive explicit assigned-student access");
  }
  const now = new Date();
  const session = (await getClient()).startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection<SchoolClassAssignmentDoc>(COL.schoolClassAssignments).updateOne(
        { school_id: schoolId, teacher_id: teacherId, class_name: normalizedClass },
        { $set: { active: true, assigned_by: actorId, assigned_at: now }, $setOnInsert: { created_at: now } },
        { upsert: true, session },
      );
      await db.collection(COL.schoolAuditEvents).insertOne({
        school_id: schoolId,
        actor_id: actorId,
        target_user_id: teacherId,
        action: "class_assignment.created",
        resource_type: "school_class",
        resource_id: normalizedClass,
        created_at: now,
      }, { session });
    });
  } finally {
    await session.endSession();
  }
}

export async function revokeSchoolClassAssignment(
  actorId: string,
  schoolId: string,
  assignmentId: string,
): Promise<void> {
  await requireSchoolPermission(actorId, schoolId, "school:classes:manage");
  if (!ObjectId.isValid(assignmentId)) throw new Error("Invalid assignment id");
  const db = await getDb();
  const session = (await getClient()).startSession();
  try {
    await session.withTransaction(async () => {
      const filter = { _id: new ObjectId(assignmentId), school_id: schoolId, active: true };
      const assignment = await db.collection<SchoolClassAssignmentDoc>(COL.schoolClassAssignments).findOne(filter, { session });
      if (!assignment) throw new Error("Class assignment not found");
      const now = new Date();
      const result = await db.collection<SchoolClassAssignmentDoc>(COL.schoolClassAssignments).updateOne(
        filter,
        { $set: { active: false, revoked_by: actorId, revoked_at: now } },
        { session },
      );
      if (result.modifiedCount !== 1) throw new Error("Class assignment not found");
      await db.collection(COL.schoolAuditEvents).insertOne({
        school_id: schoolId,
        actor_id: actorId,
        target_user_id: assignment.teacher_id,
        action: "class_assignment.revoked",
        resource_type: "school_class",
        resource_id: assignment.class_name,
        created_at: now,
      }, { session });
    });
  } finally {
    await session.endSession();
  }
}

export async function changeSchoolMemberRole(
  actorId: string,
  schoolId: string,
  targetUserId: string,
  nextRole: Exclude<SchoolRole, "director">,
  grantedPermissions: SchoolPermission[] = [],
): Promise<void> {
  await requireSchoolPermission(actorId, schoolId, "school:members:manage");
  if (actorId === targetUserId) throw new Error("Access denied: self-role changes are forbidden");
  const permissions = nextRole === "admin"
    ? [...new Set(grantedPermissions)].filter((permission) => !SCHOOL_ADMIN_FORBIDDEN_PERMISSIONS.includes(permission))
    : [];
  const db = await getDb();
  const session = (await getClient()).startSession();
  try {
    await session.withTransaction(async () => {
      const filter = { school_id: schoolId, user_id: targetUserId };
      const target = await db.collection<SchoolMemberDoc>(COL.schoolMembers).findOne(filter, { session });
      if (!target || target.role === "director") throw new Error("Member not found or role is protected");
      const updated = await db.collection<SchoolMemberDoc>(COL.schoolMembers).updateOne(
        filter,
        { $set: { role: nextRole, granted_permissions: permissions, updated_at: new Date() } },
        { session },
      );
      if (updated.matchedCount !== 1) throw new Error("Member role update failed");
      await db.collection(COL.schoolAuditEvents).insertOne({
        school_id: schoolId,
        actor_id: actorId,
        target_user_id: targetUserId,
        action: "member.role_changed",
        resource_type: "school_member",
        resource_id: targetUserId,
        previous_role: target.role,
        next_role: nextRole,
        granted_permissions: permissions,
        created_at: new Date(),
      }, { session });
    });
  } finally {
    await session.endSession();
  }
}

export async function removeSchoolMember(actorId: string, schoolId: string, targetUserId: string): Promise<void> {
  await requireSchoolPermission(actorId, schoolId, "school:members:manage");
  if (actorId === targetUserId) throw new Error("Access denied: self-removal is forbidden");
  const db = await getDb();
  const session = (await getClient()).startSession();
  try {
    await session.withTransaction(async () => {
      const filter = { school_id: schoolId, user_id: targetUserId };
      const target = await db.collection<SchoolMemberDoc>(COL.schoolMembers).findOne(filter, { session });
      if (!target || target.role === "director") throw new Error("Member not found or role is protected");
      const now = new Date();
      await db.collection<SchoolMemberDoc>(COL.schoolMembers).deleteOne(filter, { session });
      await db.collection<SchoolClassAssignmentDoc>(COL.schoolClassAssignments).updateMany(
        { school_id: schoolId, teacher_id: targetUserId, active: true },
        { $set: { active: false, revoked_by: actorId, revoked_at: now } },
        { session },
      );
      await db.collection(COL.schoolAuditEvents).insertOne({
        school_id: schoolId,
        actor_id: actorId,
        target_user_id: targetUserId,
        action: "member.removed",
        resource_type: "school_member",
        resource_id: targetUserId,
        previous_role: target.role,
        created_at: now,
      }, { session });
    });
  } finally {
    await session.endSession();
  }
}

export function schoolRoleForMember(member: SchoolMemberDoc): SchoolRole {
  return member.role;
}
