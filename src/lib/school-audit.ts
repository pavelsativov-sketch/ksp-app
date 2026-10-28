import "server-only";
import { getDb, COL } from "@/lib/mongo";
import { requireSchoolAccess } from "@/lib/school";
import { hasSchoolPermission } from "@/lib/school/role-matrix";

/**
 * Журнал действий школы (school_audit_events). События пишутся в
 * school-permissions/school.ts, но нигде не показывались — добавляем
 * чтение и серверную проверку прав.
 */

export interface SchoolAuditEvent {
  id: string;
  actor_id: string;
  target_user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  previous_role: string | null;
  next_role: string | null;
  created_at: string;
}

/** Чтение аудита доступно директору, завучу и обладателям права members:manage. */
export async function canViewSchoolAudit(userId: string, schoolId: string): Promise<boolean> {
  const member = await requireSchoolAccess(userId, schoolId);
  if (member.role === "director" || member.role === "deputy") return true;
  return hasSchoolPermission(member.role, member.granted_permissions, "school:members:manage");
}

export async function listSchoolAudit(
  requesterId: string,
  schoolId: string,
  limit = 100,
): Promise<SchoolAuditEvent[]> {
  if (!(await canViewSchoolAudit(requesterId, schoolId))) {
    throw new Error("Access denied: school audit is restricted to leadership");
  }
  const db = await getDb();
  const docs = await db
    .collection(COL.schoolAuditEvents)
    .find({ school_id: schoolId })
    .sort({ created_at: -1 })
    .limit(Math.min(500, Math.max(1, limit)))
    .toArray();
  return docs.map((d) => ({
    id: String(d._id),
    actor_id: String(d.actor_id ?? ""),
    target_user_id: d.target_user_id ? String(d.target_user_id) : null,
    action: String(d.action ?? ""),
    resource_type: d.resource_type ? String(d.resource_type) : null,
    resource_id: d.resource_id ? String(d.resource_id) : null,
    previous_role: d.previous_role ? String(d.previous_role) : null,
    next_role: d.next_role ? String(d.next_role) : null,
    created_at: (d.created_at instanceof Date ? d.created_at : new Date()).toISOString(),
  }));
}
