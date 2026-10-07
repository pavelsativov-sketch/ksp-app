import { getCurrentUser } from "@/lib/auth";
import { getActiveSchool, formatSchoolSubtitle } from "@/lib/school/active";
import { getVskSummary } from "@/lib/school-analytics";
import { getSchoolMembers } from "@/lib/school";
import { NoSchool } from "@/components/school/no-school";
import { VskRecorder } from "@/components/school/vsk-recorder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/** ВШК: реальные проверки из коллекции vsk_inspections. */
export default async function VskPage() {
  const user = await getCurrentUser();
  const school = user ? await getActiveSchool(user.id) : null;
  if (!school) return <NoSchool />;

  const [inspections, members] = await Promise.all([
    getVskSummary(school._id!.toString()).catch(() => []),
    getSchoolMembers(school._id!.toString()).catch(() => []),
  ]);
  const teachers = members.filter((member) => member.role === "teacher").map((member) => ({ id: member.user_id, name: member.full_name, subject: member.subject }));
  const completed = inspections.filter((i) => i.status === "completed");
  const avg = completed.length ? Math.round(completed.reduce((s, i) => s + i.overall_score, 0) / completed.length) : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <header className="mb-6">
        <p className="editorial-kicker">Контроль качества</p>
        <h1 className="editorial-display mt-1 text-3xl">ВШК</h1>
        <p className="mt-1 text-sm text-muted-foreground">{formatSchoolSubtitle(school)}</p>
      </header>

      <VskRecorder schoolId={school._id!.toString()} teachers={teachers} />

      {inspections.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">Проверок пока нет. Добавьте проверку, чтобы сформировать историю ВШК.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {avg !== null && (
            <Card>
              <CardHeader className="pb-2"><CardDescription>Средний балл завершённых проверок</CardDescription></CardHeader>
              <CardContent className="flex items-center gap-4">
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-primary/15">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${avg}%` }} />
                </div>
                <span className="text-2xl font-bold">{avg}/100</span>
              </CardContent>
            </Card>
          )}
          {inspections.map((i) => (
            <Card key={i._id?.toString()}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{i.direction}: {i.teacher_name ?? i.teacher_id.slice(-6)}</CardTitle>
                    <CardDescription>{i.subject ?? ""} {i.class_name ? `· ${i.class_name}` : ""} · {i.date}</CardDescription>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${i.status === "completed" ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                    {i.status === "completed" ? `${i.overall_score}/100` : "черновик"}
                  </span>
                </div>
              </CardHeader>
              {(i.findings || i.recommendations) && (
                <CardContent className="space-y-1 text-sm">
                  {i.findings && <p><span className="text-muted-foreground">Выводы:</span> {i.findings}</p>}
                  {i.recommendations && <p><span className="text-muted-foreground">Рекомендации:</span> {i.recommendations}</p>}
                  {i.checklist?.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Чек-лист: {i.checklist.map((c) => `${c.criterion} ${c.score}/${c.max_score}`).join(" · ")}
                    </p>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
