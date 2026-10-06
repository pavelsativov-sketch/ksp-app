import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool, formatSchoolSubtitle } from "@/lib/school/active";
import { getCurriculumProgress, type CurriculumDoc } from "@/lib/school-analytics";
import { NoSchool } from "@/components/school/no-school";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/** Прогресс КТП: по каждой программе — пройдено/всего уроков. */
export default async function CurriculumPage() {
  const user = await getCurrentUser();
  const school = user ? await getActiveSchool(user.id) : null;
  if (!school) return <NoSchool />;

  const plans = await getCurriculumProgress(school._id!.toString()).catch(() => []);
  const statusLabel: Record<string, string> = { completed: "пройдено", rescheduled: "перенесено", skipped: "пропущено", planned: "запланировано" };
  const statusColor: Record<string, string> = { completed: "text-emerald-600", rescheduled: "text-amber-600", skipped: "text-red-600", planned: "text-muted-foreground" };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <header className="mb-6">
        <p className="editorial-kicker">Планирование</p>
        <h1 className="editorial-display mt-1 text-3xl">КТП</h1>
        <p className="mt-1 text-sm text-muted-foreground">{formatSchoolSubtitle(school)}</p>
      </header>

      {plans.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">Календарно-тематических программ пока нет.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {(plans as CurriculumDoc[]).map((p) => {
            const done = p.lessons.filter((l) => l.status === "completed").length;
            const pct = p.lessons.length ? Math.round((done / p.lessons.length) * 100) : 0;
            return (
              <Card key={p._id?.toString()}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{p.subject} — {p.class_name}</CardTitle>
                      <CardDescription>{p.academic_year} · {p.total_hours} ч. всего</CardDescription>
                    </div>
                    <span className="shrink-0 text-xl font-bold">{pct}%</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-2.5 overflow-hidden rounded-full bg-primary/10">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {p.lessons.map((l) => (
                      <li key={l.number} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5">
                        <span className="min-w-0 truncate">{l.number}. {l.topic}</span>
                        <span className={`shrink-0 text-xs ${statusColor[l.status] ?? ""}`}>{l.planned_date} · {statusLabel[l.status] ?? l.status}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
