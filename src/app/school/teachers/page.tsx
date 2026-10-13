import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool } from "@/lib/school/active";
import { getSchoolMembers } from "@/lib/school";
import { requireSchoolAccess } from "@/lib/school";
import { hasSchoolPermission } from "@/lib/school/role-matrix";
import { getDict } from "@/lib/i18n/server";
import { schoolPermissionCopy } from "@/lib/school-permission-copy";
import { SchoolMemberManager } from "@/components/school/school-member-manager";
import { NoSchool } from "@/components/school/no-school";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/** Педагоги школы: реальные участники из school_members. */
export default async function TeachersPage() {
  const user = await getCurrentUser();
  const school = user ? await getActiveSchool(user.id) : null;
  if (!school || !school._id) return <NoSchool />;

  const schoolId = school._id.toString();
  const member = await requireSchoolAccess(user!.id, schoolId);
  const { locale } = await getDict();
  const labels = schoolPermissionCopy[locale];
  const canList = hasSchoolPermission(member.role, member.granted_permissions, "school:members:list");
  const canManage = hasSchoolPermission(member.role, member.granted_permissions, "school:members:manage");
  const members = canList ? await getSchoolMembers(schoolId) : [member];
  const roleOrder: Record<string, number> = { director: 0, admin: 1, deputy: 2, teacher: 3 };
  const sorted = [...members].sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9) || a.full_name.localeCompare(b.full_name, locale === "kk" ? "kk" : "ru"));
  const managerMembers = sorted.map(({ user_id, full_name, role, subject, granted_permissions }) => ({ user_id, full_name, role, subject, granted_permissions }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <header className="mb-6">
        <p className="editorial-kicker">{labels.collective}</p>
        <h1 className="editorial-display mt-1 text-3xl">{labels.teachersTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{members.length} {labels.membersCount}{member.role === "director" ? <> · {labels.schoolJoinCode}: <span className="font-mono">{school.code}</span></> : null}</p>
      </header>

      {canManage && <section className="mb-6 rounded-xl border border-border bg-surface p-4"><h2 className="font-semibold">{labels.membersTitle}</h2><p className="mb-4 mt-1 text-sm text-muted-foreground">{labels.membersDescription}</p><SchoolMemberManager schoolId={schoolId} initialMembers={managerMembers} labels={labels} /></section>}

      {members.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{labels.onlyYou}</CardContent></Card>
      ) : (
        <ul className="space-y-2">
          {canManage ? null : sorted.map((m) => (
            <li key={m._id?.toString()} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">
              <span className="min-w-0 truncate font-medium">{m.full_name}{m.subject ? <span className="text-muted-foreground"> · {m.subject}</span> : null}</span>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${m.role === "director" ? "bg-primary-soft font-semibold text-primary" : "bg-muted text-muted-foreground"}`}>
                {labels.roleLabels[m.role]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
