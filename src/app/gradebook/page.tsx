import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getTeacherGradebook } from "@/lib/gradebook";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function GradebookPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/gradebook");

  const { t } = await getDict();
  const g = t.gradebook;

  const data = await getTeacherGradebook(user.id);

  // Get unique subjects and grades for filters
  const subjects = [...new Set(data.rows.map((r) => r.subject).filter(Boolean))] as string[];
  const grades = [...new Set(data.rows.map((r) => r.grade).filter(Boolean))] as number[];

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-12 md:px-6 md:py-16">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-border pb-7">
        <div>
          <p className="editorial-kicker">{g.kicker}</p>
          <h1 className="editorial-display mt-3 text-5xl">{g.title}</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{g.lead}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href="/api/gradebook/export">
              <Download /> {g.exportCsv}
            </a>
          </Button>
        </div>
      </header>

      {data.rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Users className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="font-semibold text-lg">{g.noData}</p>
            <p className="text-sm text-muted-foreground">{g.noDataHint}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Filters info */}
          {(subjects.length > 0 || grades.length > 0) && (
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {subjects.length > 0 && (
                <span>
                  {g.filterSubject}: {subjects.join(", ")}
                </span>
              )}
              {grades.length > 0 && (
                <span>
                  {g.filterGrade}: {grades.sort((a, b) => a - b).join(", ")}
                </span>
              )}
            </div>
          )}

          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.students.map((student) => (
              <Link
                key={student.studentName}
                href={`/gradebook/${encodeURIComponent(student.studentName)}`}
                className="rounded-xl border border-border bg-surface p-5 shadow-card transition-shadow hover:shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <p className="font-bold text-lg">{student.studentName}</p>
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-bold ${
                      student.average >= 80
                        ? "bg-emerald-100 text-emerald-800"
                        : student.average >= 50
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-800"
                    }`}
                  >
                    {student.average}%
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {g.colAssignments}: {student.totalAssignments} · {g.attemptsCount}:{" "}
                  {student.assignments.reduce((s, a) => s + a.attempts, 0)}
                </p>
                <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      student.average >= 80
                        ? "bg-emerald-500"
                        : student.average >= 50
                          ? "bg-amber-500"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${student.average}%` }}
                  />
                </div>
              </Link>
            ))}
          </div>

          {/* Detailed table */}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-3">{g.colStudent}</th>
                  <th className="p-3">{g.assignment}</th>
                  <th className="p-3">{g.subject}</th>
                  <th className="p-3">{g.grade}</th>
                  <th className="p-3">{g.score}</th>
                  <th className="p-3">{g.percentage}</th>
                  <th className="p-3">{g.attempts}</th>
                  <th className="p-3">{g.date}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={`${row.studentName}-${row.assignmentId}-${i}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-medium">
                      <Link
                        href={`/gradebook/${encodeURIComponent(row.studentName)}`}
                        className="text-primary hover:underline"
                      >
                        {row.studentName}
                      </Link>
                    </td>
                    <td className="p-3">{row.assignmentTitle}</td>
                    <td className="p-3 text-muted-foreground">{row.subject ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{row.grade ?? "—"}</td>
                    <td className="p-3 font-bold">
                      {row.score} / {row.maxScore}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                          row.percentage >= 80
                            ? "bg-emerald-100 text-emerald-800"
                            : row.percentage >= 50
                              ? "bg-amber-100 text-amber-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {row.percentage}%
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">{row.attempts}</td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(row.date).toLocaleDateString("ru-RU")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
