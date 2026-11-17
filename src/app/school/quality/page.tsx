import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool, formatSchoolSubtitle } from "@/lib/school/active";
import { getQualityMetrics } from "@/lib/school-analytics";
import { getSchoolStudents } from "@/lib/school";
import { getJournalState } from "@/lib/journal";
import { getDict } from "@/lib/i18n/server";
import { ElectronicJournal } from "@/components/journal/electronic-journal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GradeRecorder } from "@/components/school/grade-recorder";

export const dynamic = "force-dynamic";

/** Успеваемость и электронный журнал класса (работает и для личного журнала учителя, и для школы). */
export default async function QualityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/school/quality");

  const [{ locale }, school] = await Promise.all([
    getDict(),
    getActiveSchool(user.id).catch(() => null),
  ]);

  const schoolId = school?._id?.toString() ?? null;
  const [journalState, subjects, roster] = await Promise.all([
    getJournalState(user.id, { schoolId, syncHomework: true }),
    schoolId ? getQualityMetrics(schoolId) : Promise.resolve([]),
    schoolId ? getSchoolStudents(schoolId) : Promise.resolve([]),
  ]);

  const overall = subjects.length
    ? Math.round((subjects.reduce((s, r) => s + r.average_score, 0) / subjects.length) * 100)
    : null;

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-6">
      <header>
        <p className="editorial-kicker">
          {locale === "kk" ? "Аналитика және журнал" : "Аналитика и журнал"}
        </p>
        <h1 className="editorial-display mt-1 text-3xl">
          {locale === "kk" ? "Электрондық журнал және үлгерім" : "Электронный журнал и успеваемость"}
        </h1>
        {school && (
          <p className="mt-1 text-sm text-muted-foreground">{formatSchoolSubtitle(school)}</p>
        )}
      </header>

      <ElectronicJournal initialState={journalState} locale={locale} />

      {schoolId && (
        <section className="space-y-4">
          <GradeRecorder
            schoolId={schoolId}
            students={roster.flatMap((student) =>
              student._id
                ? [{ id: student._id.toString(), name: student.full_name, className: student.class_name }]
                : [],
            )}
          />

          {subjects.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>
                    {locale === "kk" ? "Мектеп бойынша орташа білім сапасы" : "Среднее качество знаний по школе"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-4">
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-primary/15">
                    <div
                      className={`h-full rounded-full ${(overall ?? 0) < 60 ? "bg-warning" : "bg-primary"}`}
                      style={{ width: `${overall ?? 0}%` }}
                    />
                  </div>
                  <span className="text-2xl font-bold">{overall}%</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {locale === "kk" ? "Пәндер бойынша" : "По предметам"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {subjects.map((s) => {
                    const p = Math.round(s.average_score * 100);
                    return (
                      <div key={s._id} className="flex items-center gap-3 text-sm">
                        <span className="w-32 shrink-0 truncate">{s._id}</span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-primary/10">
                          <div
                            className={`h-full rounded-full ${p < 60 ? "bg-warning" : "bg-primary"}`}
                            style={{ width: `${p}%` }}
                          />
                        </div>
                        <span className="w-12 shrink-0 text-right text-xs tabular-nums">{p}%</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
