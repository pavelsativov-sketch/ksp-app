import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool } from "@/lib/school/active";
import { requireSchoolAccess } from "@/lib/school";
import { hasSchoolPermission } from "@/lib/school/role-matrix";
import { getSchoolApprovalQueue } from "@/lib/school-approvals";
import { getDict } from "@/lib/i18n/server";
import { schoolApprovalCopy } from "@/lib/school-approval-copy";
import { NoSchool } from "@/components/school/no-school";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function SchoolApprovalsPage() {
  const user = await getCurrentUser();
  const school = user ? await getActiveSchool(user.id) : null;
  if (!user || !school?._id) return <NoSchool />;
  const schoolId = school._id.toString();
  const [member, dict] = await Promise.all([requireSchoolAccess(user.id, schoolId), getDict()]);
  const copy = schoolApprovalCopy[dict.locale];
  const canReview = hasSchoolPermission(member.role, member.granted_permissions, "school:plans:review");
  const canCommentAssigned = hasSchoolPermission(member.role, member.granted_permissions, "school:plans:comment_assigned");
  if (!canReview && !canCommentAssigned) return <main className="mx-auto max-w-3xl px-4 py-10"><Card><CardHeader><CardTitle>{copy.queueTitle}</CardTitle><CardDescription>{copy.restricted}</CardDescription></CardHeader></Card></main>;
  const queue = await getSchoolApprovalQueue(user.id, schoolId);
  const language = dict.locale === "kk" ? "kk-KZ" : "ru-RU";

  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 md:px-6">
    <header>
      <p className="editorial-kicker">{school.name}</p>
      <h1 className="editorial-display mt-1 text-3xl">{copy.queueTitle}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{copy.queueDescription}</p>
    </header>
    {queue.length === 0 ? <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">{copy.emptyQueue}</CardContent></Card> :
      <ul className="space-y-3">{queue.map((item) => <li key={item.id}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{item.title}</CardTitle>
            <CardDescription>{copy.schoolClass}: {item.school_class_name} · {copy.grade}: {item.grade} · {copy.cycle} {item.cycle} · {copy.status}: {copy.statusLabels[item.status]}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <time className="text-xs text-muted-foreground" dateTime={item.submitted_at}>{copy.submittedAt}: {new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.submitted_at))}</time>
            <Button asChild><Link href={`/school/approvals/${encodeURIComponent(item.plan_id)}?school=${encodeURIComponent(schoolId)}&cycle=${encodeURIComponent(item.id)}`}>{copy.open}</Link></Button>
          </CardContent>
        </Card>
      </li>)}</ul>}
  </main>;
}
