import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getDb, COL, isMongoConfigured } from "@/lib/mongo";
import { listSubjects, type PlanDoc } from "@/lib/plans-repo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlansFilter, type PlanListItem } from "@/components/ksp/plans-filter";
import { PlanOnboarding } from "@/components/ksp/plan-onboarding";
import { getPlanExamples } from "@/lib/plan-examples";
import { listTeacherAssignments } from "@/lib/assignments";
import { listCurrentClasses } from "@/lib/classes";
import { getDict } from "@/lib/i18n/server";
import type { Dict } from "@/lib/i18n/dictionaries";
import { getActiveSchool } from "@/lib/school/active";
import { requireSchoolAccess } from "@/lib/school";
import { hasSchoolPermission } from "@/lib/school/role-matrix";
import { schoolApprovalCopy } from "@/lib/school-approval-copy";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { t, locale } = await getDict();
  const d = t.dashboard;
  if (!isMongoConfigured()) return <div className="mx-auto max-w-2xl px-4 py-16"><Card><CardHeader><CardTitle className="editorial-display text-3xl">{d.noMongoTitle}</CardTitle><CardDescription>{d.noMongoTextA} <code className="font-mono">MONGODB_URI</code> {d.noMongoTextB} <code className="font-mono">MONGODB_DB</code> {d.noMongoTextC} <code className="font-mono">.env.local</code>.</CardDescription></CardHeader></Card></div>;
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  const db = await getDb();
  // Projection: content каждого плана — огромный JSON; тянем только topic.
  // Лимит 300 — выше включается клиентская пагинация «Показать ещё».
  const [rawPlans, subjects, classes] = await Promise.all([db.collection<PlanDoc>(COL.plans).find({ owner_id: user.id }, { projection: { title: 1, grade: 1, subject_id: 1, quarter: 1, class_id: 1, updated_at: 1, visibility: 1, is_draft: 1, "content.topic": 1 } }).sort({ updated_at: -1 }).limit(300).toArray(), listSubjects().catch(() => []), listCurrentClasses(user.id).catch(() => [])]);
  const subjectMap = new Map(subjects.map((s) => [s.id, s.name_ru]));
  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  const plans: PlanListItem[] = rawPlans.map((p) => ({ id: p._id ? p._id.toString() : "", title: p.title, grade: p.grade, subject_id: p.subject_id, subject_name: p.subject_id ? subjectMap.get(p.subject_id) ?? null : null, quarter: p.quarter, class_id: p.class_id ?? null, class_name: p.class_id ? classMap.get(p.class_id) ?? null : null, updated_at: p.updated_at instanceof Date ? p.updated_at.toISOString() : String(p.updated_at), visibility: p.visibility, is_draft: Boolean(p.is_draft), topic: p.content?.topic ?? null }));
  const [assignments, activeSchool] = await Promise.all([
    listTeacherAssignments(user.id, 10).catch(() => []),
    getActiveSchool(user.id).catch(() => null),
  ]);
  const activeSchoolId = activeSchool?._id?.toString();
  const schoolMember = activeSchoolId ? await requireSchoolAccess(user.id, activeSchoolId).catch(() => null) : null;
  const canOpenSchoolApprovals = Boolean(schoolMember && (
    hasSchoolPermission(schoolMember.role, schoolMember.granted_permissions, "school:plans:review")
    || hasSchoolPermission(schoolMember.role, schoolMember.granted_permissions, "school:plans:comment_assigned")
  ));
  const approvalCopy = schoolApprovalCopy[locale];

  return <div className="mx-auto max-w-[1200px] space-y-10 px-4 py-12 md:px-6 md:py-16">
    <header className="grid gap-5 border-b border-border pb-7 md:grid-cols-[1fr_auto] md:items-end"><div><p className="editorial-kicker">{d.kicker}</p><h1 className="editorial-display mt-3 text-5xl">{d.title}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{d.lead}</p></div><Button asChild><Link href="/plans/new"><Plus /> {d.newKsp}</Link></Button></header>
    {canOpenSchoolApprovals && <Link href="/school/approvals" className="block rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      <span className="font-semibold">{approvalCopy.queueTitle}</span>
      <span className="mt-1 block text-sm text-muted-foreground">{approvalCopy.queueDescription}</span>
    </Link>}
    {plans.length === 0 ? <Card><CardContent className="py-18 text-center space-y-7"><PlanOnboarding examples={getPlanExamples(subjects)} dashboard /></CardContent></Card> : <PlansFilter plans={plans} subjects={subjects} classes={classes.map((c) => ({ id: c.id, name: c.name }))} showVisibility showEditLink emptyMessage="Пока нет КСП" />}
    <AssignmentsList rows={assignments} a={t.assignments} />
  </div>;
}

function AssignmentsList({ rows, a }: { rows: Awaited<ReturnType<typeof listTeacherAssignments>>; a: Dict["assignments"] }) {
  if (rows.length === 0) return null;
  return (
    <section id="assignments" aria-labelledby="assignments-title" className="space-y-4">
      <div className="flex items-end justify-between border-b border-border pb-4">
        <div>
          <p className="editorial-kicker">{a.dashKicker}</p>
          <h2 id="assignments-title" className="editorial-display mt-2 text-3xl">{a.dashTitle}</h2>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <Link key={row.id} href={`/assignments/${row.id}`} className="rounded-xl border border-border bg-surface p-4 shadow-card transition-shadow hover:shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{row.title}</p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${row.status === "open" ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>
                {row.status === "open" ? a.openB : a.closedB}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">/a/{row.code}</p>
            <p className="mt-2 text-xs text-muted-foreground">{a.tasksW}: {row.tasksCount} · {a.passedW}: {row.attemptsCount}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
