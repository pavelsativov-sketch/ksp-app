import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool, formatSchoolSubtitle } from "@/lib/school/active";
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

export const dynamic = "force-dynamic";

function percent(value: number | null): string {
  return value === null ? "Нет данных" : `${Math.round(value * 100)}%`;
}

/** Отчёты школы формируются из фактических записей, без тестовых наборов. */
export default async function SchoolReportsPage() {
  const user = await getCurrentUser();
  const school = user ? await getActiveSchool(user.id) : null;
  if (!school) return <NoSchool />;

  const schoolId = school._id!.toString();
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
          <p className="editorial-kicker">Аналитика школы</p>
          <h1 className="editorial-display mt-1 text-3xl">Отчёты</h1>
          <p className="mt-2 text-sm text-muted-foreground">{formatSchoolSubtitle(school)}</p>
        </div>
        <div className="flex gap-2">
          <a className="inline-flex h-10 items-center gap-2 rounded-control border border-border bg-surface px-4 text-sm font-semibold hover:bg-muted" href={`/api/school/${schoolId}/reports?format=csv`}><Download /> Скачать CSV</a>
          <PrintReportButton />
        </div>
      </header>

      {!overview.hasData ? (
        <Card className="border-dashed"><CardContent className="py-12 text-center">
          <p className="font-semibold">Пока нет данных для отчёта</p>
          <p className="mt-2 text-sm text-muted-foreground">Добавьте учащихся, отметки посещаемости, оценки или учебные программы. Отчёт обновится автоматически.</p>
        </CardContent></Card>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Сводные показатели">
            {[
              ["Учащиеся", String(overview.students)],
              ["Педагоги", String(overview.teachers)],
              ["Посещаемость", percent(overview.attendanceRate)],
              ["Выполнение КТП", percent(overview.curriculumProgress)],
            ].map(([label, value]) => <Card key={label}><CardHeader className="pb-2"><CardDescription>{label}</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold">{value}</p></CardContent></Card>)}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Посещаемость по классам</CardTitle><CardDescription>Доля присутствующих по сохранённым отметкам</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {attendance.length ? attendance.map((row) => <div key={row.className} className="grid grid-cols-[4rem_1fr_3.5rem] items-center gap-3 text-sm">
                  <span>{row.className}</span><div className="h-2 overflow-hidden rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(row.rate * 100)}%` }} /></div><span className="text-right tabular-nums">{Math.round(row.rate * 100)}%</span>
                </div>) : <p className="text-sm text-muted-foreground">Отметок посещаемости пока нет.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Результаты по предметам</CardTitle><CardDescription>Средний балл относительно максимального</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {quality.length ? quality.map((row) => <div key={row._id} className="grid grid-cols-[minmax(6rem,10rem)_1fr_3.5rem] items-center gap-3 text-sm">
                  <span className="truncate">{row._id || "Без предмета"}</span><div className="h-2 overflow-hidden rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(row.average_score * 100)}%` }} /></div><span className="text-right tabular-nums">{Math.round(row.average_score * 100)}%</span>
                </div>) : <p className="text-sm text-muted-foreground">Оценок пока нет.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Учебные программы</CardTitle><CardDescription>Прогресс и количество уроков</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {curriculum.length ? curriculum.map((item) => {
                  const completed = item.lessons.filter((lesson) => lesson.status === "completed").length;
                  return <div key={item._id?.toString()} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"><span className="truncate">{item.subject} · {item.class_name}</span><span className="shrink-0 text-muted-foreground">{completed}/{item.lessons.length} уроков</span></div>;
                }) : <p className="text-sm text-muted-foreground">Учебных программ пока нет.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Внутришкольный контроль</CardTitle><CardDescription>Сводка завершённых проверок</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {vsk.length ? vsk.map((item) => <div key={item._id?.toString()} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"><span className="truncate">{item.direction} · {item.teacher_name || "Педагог"}</span><span className="shrink-0 text-muted-foreground">{item.status === "completed" ? `${item.overall_score}/100` : "Черновик"}</span></div>) : <p className="text-sm text-muted-foreground">Проверок пока нет.</p>}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </main>
  );
}
