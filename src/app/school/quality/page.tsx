import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool, formatSchoolSubtitle } from "@/lib/school/active";
import { getQualityMetrics } from "@/lib/school-analytics";
import { getSchoolStudents } from "@/lib/school";
import { NoSchool } from "@/components/school/no-school";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GradeRecorder } from "@/components/school/grade-recorder";

export const dynamic = "force-dynamic";

/** Успеваемость: среднее качество знаний по предметам (score/max). */
export default async function QualityPage() {
  const user = await getCurrentUser();
  const school = user ? await getActiveSchool(user.id) : null;
  if (!school) return <NoSchool />;

  const [subjects, roster] = await Promise.all([
    getQualityMetrics(school._id!.toString()).catch(() => []),
    getSchoolStudents(school._id!.toString()).catch(() => []),
  ]);
  const overall = subjects.length
    ? Math.round((subjects.reduce((s, r) => s + r.average_score, 0) / subjects.length) * 100)
    : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <header className="mb-6">
        <p className="editorial-kicker">Аналитика</p>
        <h1 className="editorial-display mt-1 text-3xl">Успеваемость</h1>
        <p className="mt-1 text-sm text-muted-foreground">{formatSchoolSubtitle(school)}</p>
      </header>

      <GradeRecorder schoolId={school._id!.toString()} students={roster.flatMap((student) => student._id ? [{ id: student._id.toString(), name: student.full_name, className: student.class_name }] : [])} />

      {subjects.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">Оценок пока нет. Добавьте первую оценку выше.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Среднее качество знаний по школе</CardDescription></CardHeader>
            <CardContent className="flex items-center gap-4">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-primary/15">
                <div className={`h-full rounded-full ${(overall ?? 0) < 60 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${overall ?? 0}%` }} />
              </div>
              <span className="text-2xl font-bold">{overall}%</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">По предметам</CardTitle></CardHeader>
            <CardContent className="space-y-2.5">
              {subjects.map((s) => {
                const p = Math.round(s.average_score * 100);
                return (
                  <div key={s._id} className="flex items-center gap-3 text-sm">
                    <span className="w-32 shrink-0 truncate">{s._id}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-primary/10">
                      <div className={`h-full rounded-full ${p < 60 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${p}%` }} />
                    </div>
                    <span className="w-12 shrink-0 text-right font-mono text-xs">{p}%</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
