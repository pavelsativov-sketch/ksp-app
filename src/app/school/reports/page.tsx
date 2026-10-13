import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool } from "@/lib/school/active";
import {
  getAttendancePerClass,
  getCurriculumProgress,
  getQualityMetrics,
  getSchoolOverview,
  getVskSummary,
} from "@/lib/school-analytics";
import { NoSchool } from "@/components/school/no-school";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download } from "lucide-react";
import { PrintReportButton } from "@/components/school/print-report-button";
import { getDict } from "@/lib/i18n/server";
import { schoolReportCopy } from "@/lib/school-report-copy";
import { formatReportTimestamp } from "@/lib/school-report-export";
import { requireSchoolAccess } from "@/lib/school";
import { hasSchoolPermission } from "@/lib/school/role-matrix";

export const dynamic = "force-dynamic";

/** Отчёты школы формируются из фактических записей, без тестовых наборов. */
export default async function SchoolReportsPage() {
  const user = await getCurrentUser();
  const school = user ? await getActiveSchool(user.id) : null;
  if (!school) return <NoSchool />;

  const { locale } = await getDict();
  const copy = schoolReportCopy[locale];
  const schoolId = school._id!.toString();
  const member = await requireSchoolAccess(user!.id, schoolId);
  if (!hasSchoolPermission(member.role, member.granted_permissions, "school:reports:read")) {
    return <main className="mx-auto max-w-3xl px-4 py-12 md:px-6"><h1 className="editorial-display text-3xl">{copy.reportsTitle}</h1><p className="mt-3 text-sm text-muted-foreground" role="status">{copy.restricted}</p></main>;
  }
  const canExport = hasSchoolPermission(member.role, member.granted_permissions, "school:reports:export");
  const timeZone = "Asia/Almaty";
  const generatedAt = new Date();
  const formattedAt = formatReportTimestamp(generatedAt, locale, timeZone);

  const [overview, attendance, quality, curriculum, vsk] = await Promise.all([
    getSchoolOverview(schoolId),
    getAttendancePerClass(schoolId),
    getQualityMetrics(schoolId),
    getCurriculumProgress(schoolId),
    getVskSummary(schoolId),
  ]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="editorial-kicker">{copy.reportsKicker}</p>
          <h1 className="editorial-display mt-1 text-3xl">{copy.reportsTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{school.region}, {school.city} • {school.academic_year} {copy.schoolYear}</p>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{copy.reportsLead}</p>
        </div>
        <div className="grid gap-3">
          {canExport && <div className="flex flex-wrap gap-2">
            <a className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border bg-surface px-4 text-sm font-semibold hover:bg-muted" href={`/api/school/${schoolId}/reports?format=csv&timezone=${encodeURIComponent(timeZone)}`}>
              <Download aria-hidden="true" className="size-4" />{copy.csvDownload}
            </a>
            <PrintReportButton label={copy.print} />
          </div>}
          <div className="text-xs text-muted-foreground">
            <p>{copy.period}: {copy.allPeriod} · {copy.filters}: {copy.noFilters}</p>
            <p>{copy.exportedAt}: {formattedAt} · {copy.timeZone}: {timeZone}</p>
            <p>{copy.disclosure}</p>
          </div>
        </div>
      </header>

      {!overview.hasData ? (
        <Card className="border-dashed"><CardContent className="py-12 text-center">
          <p className="font-semibold">{copy.noReportData}</p>
          <p className="mt-2 text-sm text-muted-foreground">{copy.noReportDataHint}</p>
        </CardContent></Card>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={copy.summaryAria}>
            {[
              [copy.students, String(overview.students)],
              [copy.teachers, String(overview.teachers)],
              [copy.attendanceRate, overview.attendanceRate === null ? copy.noData : `${Math.round(overview.attendanceRate * 100)}%`],
              [copy.curriculumProgress, overview.curriculumProgress === null ? copy.noData : `${Math.round(overview.curriculumProgress * 100)}%`],
            ].map(([label, value]) => <Card key={label}><CardHeader className="pb-2"><CardDescription>{label}</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold">{value}</p></CardContent></Card>)}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">{copy.attendanceSection}</CardTitle><CardDescription>{copy.attendanceNote}</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {attendance.length ? attendance.map((row) => <div key={row.className} className="grid grid-cols-[4rem_1fr_3.5rem] items-center gap-3 text-sm">
                  <span>{row.className}</span><div className="h-2 overflow-hidden rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(row.rate * 100)}%` }} /></div><span className="text-right tabular-nums">{Math.round(row.rate * 100)}%</span>
                </div>) : <p className="text-sm text-muted-foreground">{copy.attendanceEmpty}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">{copy.qualitySection}</CardTitle><CardDescription>{copy.qualityNote}</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {quality.length ? quality.map((row) => <div key={row._id} className="grid grid-cols-[minmax(6rem,10rem)_1fr_3.5rem] items-center gap-3 text-sm">
                  <span className="truncate">{row._id || copy.noSubject}</span><div className="h-2 overflow-hidden rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(row.average_score * 100)}%` }} /></div><span className="text-right tabular-nums">{Math.round(row.average_score * 100)}%</span>
                </div>) : <p className="text-sm text-muted-foreground">{copy.qualityEmpty}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">{copy.curriculumSection}</CardTitle><CardDescription>{copy.curriculumNote}</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {curriculum.length ? curriculum.map((item) => {
                  const completed = item.lessons.filter((lesson) => lesson.status === "completed").length;
                  return <div key={item._id?.toString() ?? `${item.subject}-${item.class_name}`} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"><span className="truncate">{item.subject} · {item.class_name}</span><span className="shrink-0 text-muted-foreground">{completed}/{item.lessons.length}</span></div>;
                }) : <p className="text-sm text-muted-foreground">{copy.curriculumEmpty}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">{copy.vskSection}</CardTitle><CardDescription>{copy.vskNote}</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {vsk.length ? vsk.map((item) => <div key={item._id?.toString() ?? `${item.direction}-${item.date}`} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"><span className="truncate">{item.direction} · {item.teacher_name || copy.noTeacher}</span><span className="shrink-0 text-muted-foreground">{item.status === "completed" ? `${item.overall_score}/100` : copy.draft}</span></div>) : <p className="text-sm text-muted-foreground">{copy.vskEmpty}</p>}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </main>
  );
}
