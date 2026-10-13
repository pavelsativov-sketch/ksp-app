import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { getSchoolById } from '@/lib/school';
import { requireSchoolPermission } from '@/lib/school-permissions';
import { getAttendancePerClass, getCurriculumProgress, getQualityMetrics, getSchoolOverview, getVskSummary } from '@/lib/school-analytics';
import { getDict } from '@/lib/i18n/server';
import { schoolReportCopy } from '@/lib/school-report-copy';
import { formatReportTimestamp, resolveReportTimeZone, toCsv, type CsvValue } from '@/lib/school-report-export';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const permission = url.searchParams.get('format') === 'csv' ? 'school:reports:export' : 'school:reports:read';
    await requireSchoolPermission(user.id, id, permission);
    const school = await getSchoolById(id);
    if (!school) throw new Error('School not found');
    const { locale } = await getDict();
    const copy = schoolReportCopy[locale];
    const generatedAt = new Date();
    const timeZone = resolveReportTimeZone(url.searchParams.get('timezone'));
    const formattedAt = formatReportTimestamp(generatedAt, locale, timeZone);
    const [overview, attendance, quality, curriculum, vsk] = await Promise.all([
      getSchoolOverview(id),
      getAttendancePerClass(id),
      getQualityMetrics(id),
      getCurriculumProgress(id),
      getVskSummary(id),
    ]);
    const metadata = {
      schoolName: school.name,
      period: copy.allPeriod,
      filters: copy.noFilters,
      generatedAt: generatedAt.toISOString(),
      formattedAt,
      timeZone,
      disclosure: copy.disclosure,
    };
    const report = { generatedAt: generatedAt.toISOString(), metadata, overview, attendance, quality, curriculum, vsk };
    if (url.searchParams.get("format") === "csv") {
      const percent = (value: number | null) => value === null ? copy.noData : `${Math.round(value * 100)}%`;
      const rows: CsvValue[][] = [
        [copy.section, copy.field, copy.value, copy.note, copy.source],
        [copy.metadata, copy.school, school.name, "", copy.sourceEntered],
        [copy.metadata, copy.period, copy.allPeriod, "", copy.sourceComputed],
        [copy.metadata, copy.filters, copy.noFilters, "", copy.sourceComputed],
        [copy.metadata, copy.exportedAt, formattedAt, "", copy.sourceComputed],
        [copy.metadata, copy.timeZone, timeZone, "", copy.sourceComputed],
        [copy.methodology, copy.disclosure, "", "", copy.sourceComputed],
        [copy.overview, copy.students, overview.students, "", copy.sourceEntered],
        [copy.overview, copy.teachers, overview.teachers, "", copy.sourceEntered],
        [copy.overview, copy.classes, overview.classes, "", copy.sourceComputed],
        [copy.overview, copy.attendanceRate, percent(overview.attendanceRate), copy.attendanceNote, copy.sourceComputed],
        [copy.overview, copy.qualityScore, percent(overview.qualityScore), copy.qualityNote, copy.sourceComputed],
        [copy.overview, copy.curriculumProgress, percent(overview.curriculumProgress), copy.curriculumNote, copy.sourceComputed],
        [copy.attendanceSection, copy.class, copy.percent, copy.attendanceCount, copy.source],
        ...attendance.map((item) => [copy.attendanceSection, item.className, `${Math.round(item.rate * 100)}%`, item.total, copy.sourceComputed]),
        [copy.qualitySection, copy.subject, copy.averagePercent, "", copy.source],
        ...quality.map((item) => [copy.qualitySection, item._id || copy.noSubject, `${Math.round(item.average_score * 100)}%`, "", copy.sourceComputed]),
        [copy.curriculumSection, copy.subjectClass, copy.completedLessons, copy.totalLessons, copy.source],
        ...curriculum.map((item) => [copy.curriculumSection, `${item.subject} · ${item.class_name}`, item.lessons.filter((lesson) => lesson.status === "completed").length, item.lessons.length, copy.sourceComputed]),
        [copy.vskSection, copy.inspection, copy.score, copy.status, copy.source],
        ...vsk.map((item) => [copy.vskSection, `${item.direction} · ${item.teacher_name || copy.noTeacher}`, item.status === "completed" ? item.overall_score : copy.noData, item.status === "completed" ? copy.completed : copy.draft, copy.sourceEntered]),
      ];
      return new Response(toCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="school-report-${id}.csv"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return NextResponse.json({ report }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка";
    const status = message.includes("Access denied") ? 403 : message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
