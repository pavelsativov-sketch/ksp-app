import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool, formatSchoolSubtitle } from "@/lib/school/active";
import { getAttendancePerClass, getAttendancePerDay, getAttendanceSummary } from "@/lib/school-analytics";
import { getSchoolStudents } from "@/lib/school";
import { NoSchool } from "@/components/school/no-school";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AttendanceRecorder } from "@/components/school/attendance-recorder";

export const dynamic = "force-dynamic";

/** Посещаемость на реальных данных: общий %, по классам и по дням. */
export default async function AttendancePage() {
  const user = await getCurrentUser();
  const school = user ? await getActiveSchool(user.id) : null;
  if (!school) return <NoSchool />;

  const [summary, perClass, perDay, roster] = await Promise.all([
    getAttendanceSummary(school._id!.toString(), "2000-01-01", "2099-01-01").catch(() => []),
    getAttendancePerClass(school._id!.toString()).catch(() => []),
    getAttendancePerDay(school._id!.toString()).catch(() => []),
    getSchoolStudents(school._id!.toString()).catch(() => []),
  ]);

  const total = summary.reduce((s, r) => s + r.count, 0);
  const present = summary.find((r) => r._id === "present")?.count ?? 0;
  const rate = total ? Math.round((present / total) * 100) : null;
  const maxDay = Math.max(...perDay.map((d) => d.rate), 0.01);

  const statusLabel: Record<string, string> = {
    present: "Присутствовали",
    absent_excused: "Уважительная причина",
    absent_unexcused: "Без уважительной причины",
    late: "Опоздания",
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <header className="mb-6">
        <p className="editorial-kicker">Аналитика</p>
        <h1 className="editorial-display mt-1 text-3xl">Посещаемость</h1>
        <p className="mt-1 text-sm text-muted-foreground">{formatSchoolSubtitle(school)}</p>
      </header>

      <AttendanceRecorder schoolId={school._id!.toString()} students={roster.flatMap((student) => student._id ? [{ id: student._id.toString(), name: student.full_name, className: student.class_name }] : [])} />
      {total === 0 ? (
        <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">Отметок посещаемости пока нет. Выберите класс и сохраните отметки выше.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card className="p-4"><CardDescription>Всего отметок</CardDescription><CardTitle className="text-2xl">{total}</CardTitle></Card>
            {summary.slice(0, 3).map((s) => (
              <Card key={s._id} className="p-4"><CardDescription>{statusLabel[s._id] ?? s._id}</CardDescription><CardTitle className="text-2xl">{s.count}</CardTitle></Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Общая посещаемость</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-4">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-primary/15">
                <div className="h-full rounded-full bg-primary" style={{ width: `${rate ?? 0}%` }} />
              </div>
              <span className="text-xl font-bold">{rate}%</span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">По классам</CardTitle></CardHeader>
            <CardContent className="space-y-2.5">
              {perClass.map((c) => (
                <div key={c.className} className="flex items-center gap-3 text-sm">
                  <span className="w-10 shrink-0 font-semibold">{c.className}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-primary/10">
                    <div className={`h-full rounded-full ${c.rate < 0.85 ? "bg-red-400" : "bg-emerald-500"}`} style={{ width: `${Math.round(c.rate * 100)}%` }} />
                  </div>
                  <span className={`w-12 shrink-0 text-right font-mono text-xs ${c.rate < 0.85 ? "text-red-600" : ""}`}>{Math.round(c.rate * 100)}%</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">По дням</CardTitle></CardHeader>
            <CardContent>
              <div className="flex h-24 items-end gap-1">
                {perDay.map((d) => (
                  <div key={d.date} title={`${d.date}: ${Math.round(d.rate * 100)}%`} className="flex-1 rounded-t bg-primary/70" style={{ height: `${Math.max(6, (d.rate / maxDay) * 100)}%` }} />
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{perDay[0]?.date} — {perDay[perDay.length - 1]?.date}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
