import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { schoolApprovalCopy } from "@/lib/school-approval-copy";
import { getApprovalCycleForViewer } from "@/lib/school-approvals";
import type { SchoolApprovalCycleView } from "@/lib/school-approvals";
import { SchoolApprovalPanel } from "@/components/school/school-approval-panel";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function SchoolApprovalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ school?: string | string[]; cycle?: string | string[] }>;
}) {
  const [{ planId }, query, user, dict] = await Promise.all([params, searchParams, getCurrentUser(), getDict()]);
  const schoolId = Array.isArray(query.school) ? query.school[0] : query.school;
  const cycleId = Array.isArray(query.cycle) ? query.cycle[0] : query.cycle;
  if (!user || !schoolId || !cycleId) notFound();
  let cycle: SchoolApprovalCycleView;
  try {
    cycle = await getApprovalCycleForViewer(user.id, schoolId, cycleId);
  } catch {
    notFound();
  }
  if (cycle.plan_id !== planId) notFound();
  const copy = schoolApprovalCopy[dict.locale];

  return <main className="mx-auto max-w-4xl space-y-5 px-4 py-8 md:px-6">
    <Button asChild variant="outline"><Link href="/school/approvals">{copy.queueTitle}</Link></Button>
    <SchoolApprovalPanel schoolId={schoolId} planId={planId} locale={dict.locale} mode="reviewer" cycleId={cycle.id} />
  </main>;
}
