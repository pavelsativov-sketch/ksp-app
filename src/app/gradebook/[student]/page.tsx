import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Award, BarChart3, Download, TrendingDown, TrendingUp } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getStudentResults } from "@/lib/gradebook";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function StudentGradebookPage({ params }: { params: Promise<{ student: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/gradebook");
  const { student: studentName } = await params;
  // Next 16 уже декодирует params; повторный decodeURIComponent на имени
  // с «%» (напр. «Иванов 50%») кидал бы URIError и ронял страницу.
  const { t } = await getDict();
  const g = t.gradebook;
  const student = await getStudentResults(user.id, studentName);
  if (!student) notFound();

  const scoreColor = (percentage: number) => percentage >= 80 ? "bg-emerald-500" : percentage >= 50 ? "bg-amber-500" : "bg-red-500";
  const scoreTextColor = (percentage: number) => percentage >= 80 ? "text-emerald-700" : percentage >= 50 ? "text-amber-700" : "text-red-700";
  const maxPercentage = 100;

  return (
    <div className="mx-auto max-w-[1100px] space-y-8 px-4 py-12 md:px-6 md:py-16">
      <header className="space-y-5 border-b border-border pb-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="editorial-kicker">{g.studentResults}</p>
            <h1 className="editorial-display mt-3 text-5xl">{student.studentName}</h1>
            <p className="mt-3 text-sm text-muted-foreground">{g.totalAssignments}: {student.totalAssignments}</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`/api/gradebook/export?student=${encodeURIComponent(studentName)}`}>
                <Download /> {g.exportCsv}
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/gradebook"><ArrowLeft /> {g.backToGradebook}</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-3"><div className="rounded-lg bg-primary-soft p-2 text-primary"><BarChart3 /></div><span className="text-sm text-muted-foreground">{g.average}</span></div>
          <p className="mt-4 text-3xl font-extrabold">{student.average}%</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-3"><div className="rounded-lg bg-emerald-100 p-2 text-emerald-700"><TrendingUp /></div><span className="text-sm text-muted-foreground">{g.best}</span></div>
          <p className="mt-4 text-3xl font-extrabold text-emerald-700">{student.best}%</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-3"><div className="rounded-lg bg-red-100 p-2 text-red-700"><TrendingDown /></div><span className="text-sm text-muted-foreground">{g.worst}</span></div>
          <p className="mt-4 text-3xl font-extrabold text-red-700">{student.worst}%</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{g.scoreHistory}</CardTitle></CardHeader>
        <CardContent className="p-6 pt-0">
          {student.assignments.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{g.noResults}</p> : (
            <div className="space-y-3">
              {[...student.assignments].reverse().map((row, i) => (
                <div key={`${row.assignmentId}-${i}`} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{row.assignmentTitle}</p><p className="text-xs text-muted-foreground">{new Date(row.date).toLocaleDateString("ru-RU")}</p></div>
                  <div className="hidden w-56 items-center gap-2 sm:flex"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${scoreColor(row.percentage)}`} style={{ width: `${Math.min(100, Math.max(0, (row.percentage / maxPercentage) * 100))}%` }} /></div></div>
                  <span className={`w-12 text-right text-sm font-bold ${scoreTextColor(row.percentage)}`}>{row.percentage}%</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-border bg-muted/50"><th className="p-3">{g.assignment}</th><th className="p-3">{g.subject}</th><th className="p-3">{g.grade}</th><th className="p-3">{g.score}</th><th className="p-3">{g.percentage}</th><th className="p-3">{g.attempts}</th><th className="p-3">{g.date}</th></tr></thead>
          <tbody>{student.assignments.map((row, i) => <tr key={`${row.assignmentId}-${i}`} className="border-b border-border last:border-0"><td className="p-3 font-medium">{row.assignmentTitle}</td><td className="p-3 text-muted-foreground">{row.subject ?? "—"}</td><td className="p-3 text-muted-foreground">{row.grade ?? "—"}</td><td className="p-3 font-bold">{row.score} / {row.maxScore}</td><td className={`p-3 font-bold ${scoreTextColor(row.percentage)}`}>{row.percentage}%</td><td className="p-3 text-muted-foreground">{row.attempts}</td><td className="p-3 text-muted-foreground">{new Date(row.date).toLocaleDateString("ru-RU")}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
