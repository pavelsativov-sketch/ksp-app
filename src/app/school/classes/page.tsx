import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool } from "@/lib/school/active";
import { getSchoolClasses, getSchoolMembers, getSchoolStudents, requireSchoolAccess } from "@/lib/school";
import { getAssignedSchoolClassNames } from "@/lib/school-permissions";
import { hasSchoolPermission } from "@/lib/school/role-matrix";
import { getDict } from "@/lib/i18n/server";
import { schoolPermissionCopy } from "@/lib/school-permission-copy";
import { schoolApprovalCopy } from "@/lib/school-approval-copy";
import { ClassAssignmentManager } from "@/components/school/class-assignment-manager";
import { NoSchool } from "@/components/school/no-school";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/** Классы школы: собираются из реального контингента учеников. */
export default async function ClassesPage() {
  const user = await getCurrentUser();
  const school = user ? await getActiveSchool(user.id) : null;
  if (!school || !school._id) return <NoSchool />;
  const schoolId = school._id.toString();
  const member = await requireSchoolAccess(user!.id, schoolId);
  const canReadAll = hasSchoolPermission(member.role, member.granted_permissions, "school:students:read_all");
  const canReadAssigned = hasSchoolPermission(member.role, member.granted_permissions, "school:students:read_assigned");
  const allowedClassNames = canReadAll ? undefined : canReadAssigned ? await getAssignedSchoolClassNames(schoolId, user!.id) : [];
  const students = await getSchoolStudents(schoolId, undefined, false, allowedClassNames);
  const canManageAssignments = hasSchoolPermission(member.role, member.granted_permissions, "school:classes:manage");
  const canReviewPlans = hasSchoolPermission(member.role, member.granted_permissions, "school:plans:review");
  const canCommentAssignedPlans = hasSchoolPermission(member.role, member.granted_permissions, "school:plans:comment_assigned");
  const [dict, allSchoolClasses, schoolMembers] = await Promise.all([
    getDict(),
    canManageAssignments ? getSchoolClasses(schoolId) : Promise.resolve([] as string[]),
    canManageAssignments ? getSchoolMembers(schoolId) : Promise.resolve([]),
  ]);
  const locale = dict.locale;
  const labels = schoolPermissionCopy[locale];
  const approvalLabels = schoolApprovalCopy[locale];
  const teacherOptions = schoolMembers
    .filter((item) => item.role === "teacher")
    .map((item) => ({ user_id: item.user_id, full_name: item.full_name, role: "teacher" as const }));
  const byClass = new Map<string, { total: number; boys: number; girls: number }>();
  for (const s of students) {
    const c = byClass.get(s.class_name) ?? { total: 0, boys: 0, girls: 0 };
    c.total += 1;
    if (s.gender === "M") c.boys += 1; else c.girls += 1;
    byClass.set(s.class_name, c);
  }
  const classes = [...byClass.entries()].sort(([a], [b]) => a.localeCompare(b, locale === "kk" ? "kk" : "ru", { numeric: true }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div><p className="editorial-kicker">{labels.classesKicker}</p>
        <h1 className="editorial-display mt-1 text-3xl">{labels.classesTitle}</h1></div>
        {(canReviewPlans || canCommentAssignedPlans) && <Button asChild variant="outline"><Link href="/school/approvals">{approvalLabels.queueTitle}</Link></Button>}
      </header>

      {canManageAssignments && <div className="mb-6"><ClassAssignmentManager schoolId={schoolId} classes={allSchoolClasses} members={teacherOptions} labels={labels} /></div>}

      {classes.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">{canReadAll ? labels.noClasses : labels.noAssignedClasses}</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map(([name, c]) => (
            <Card key={name}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{name}</CardTitle>
                <CardDescription className="flex items-center gap-1.5"><Users className="size-3.5" /> {c.total < 5 ? labels.smallGroup : `${c.total} ${labels.studentsCount}`}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {c.total < 5 ? null : <span>{c.boys} {labels.boys} · {c.girls} {labels.girls}</span>}
                <Link href={`/school/students?class=${encodeURIComponent(name)}`} className="ml-2 editorial-link font-semibold text-primary">{labels.openClass}</Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
