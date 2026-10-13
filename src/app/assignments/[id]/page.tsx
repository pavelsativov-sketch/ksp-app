import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAssignmentResults } from "@/lib/assignments";
import { AssignmentActions } from "@/components/assignments/assignment-actions";
import { AssignmentAnalytics } from "@/components/assignments/assignment-analytics";
import { assignmentAnalyticsCopy } from "@/components/assignments/assignment-preview-copy";
import { EditedReissueForm } from "@/components/assignments/edited-reissue-form";
import { Card, CardContent } from "@/components/ui/card";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AssignmentResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  const { id } = await params;
  const data = await getAssignmentResults(user.id, id).catch(() => null);
  if (!data) notFound();
  const { locale, t } = await getDict();
  const r = t.assignments.results;
  const analyticsCopy = assignmentAnalyticsCopy[locale];

  const avg = data.averageScore === null ? "—" : data.averageScore.toFixed(1);

  return (
    <div className="mx-auto max-w-[900px] space-y-8 px-4 py-12 md:px-6">
      <header className="border-b border-border pb-6">
        <p className="editorial-kicker">{r.kickerOpen} · код {data.code} · {data.status === "open" ? r.openW : data.status === "expired" ? analyticsCopy.expiredStatus : r.closedW}</p>
        <h1 className="editorial-display mt-3 text-4xl">{data.title}</h1>
        {data.sourceAssignmentId && <p className="mt-2 text-sm text-muted-foreground">{analyticsCopy.sourceLead} <Link href={`/assignments/${data.sourceAssignmentId}`} className="underline">{analyticsCopy.sourceOpen}</Link></p>}
        <p className="mt-2 text-sm text-muted-foreground">
          {r.passedW}: {data.studentCount} · {r.avgW}: {avg} / {data.maxScore}
        </p>
        <div className="mt-4">
          <AssignmentActions id={data.id} code={data.code} status={data.status === "open" ? "open" : "closed"} />
          <div className="mt-3">
            <EditedReissueForm
              sourceId={data.id}
              sourceTitle={data.title}
              subject={data.subject}
              grade={data.grade}
              sourceFeedbackMode={data.feedbackMode}
              sourceFingerprint={data.editFingerprint}
              tasks={data.editableTasks}
            />
          </div>
        </div>
      </header>
      <AssignmentAnalytics analytics={data.analytics} locale={locale} />
      {data.rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          {r.empty} {r.emptyHint} <span className="font-mono">/a/{data.code}</span>.
        </CardContent></Card>
      ) : (
        <>
        {data.rowsTruncated && <p className="text-sm text-muted-foreground">{analyticsCopy.rowsLimited(data.rows.length, data.studentCount)}</p>}
        <div className="space-y-3 md:hidden">
          {data.rows.map((row, i) => (
            <Card key={`${row.name}-${i}`}>
              <CardContent className="space-y-3 p-4">
                <h2 className="font-semibold">{i + 1}. {row.name}</h2>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><dt className="text-muted-foreground">{analyticsCopy.bestResult}</dt><dd className="font-bold">{row.score} / {data.maxScore}</dd></div>
                  <div><dt className="text-muted-foreground">{analyticsCopy.lastResult}</dt><dd>{row.lastScore === null || row.lastMaxScore === null ? "—" : `${row.lastScore} / ${row.lastMaxScore}`}</dd></div>
                  <div><dt className="text-muted-foreground">{r.thAttempts}</dt><dd>{row.attempts}</dd></div>
                  <div><dt className="text-muted-foreground">{r.thDate}</dt><dd>{new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : "ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.createdAt))}</dd></div>
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th scope="col" className="p-3">{r.thNum}</th>
                <th scope="col" className="p-3">{r.thStudent}</th>
                <th scope="col" className="p-3">{analyticsCopy.bestResult}</th>
                <th scope="col" className="p-3">{analyticsCopy.lastResult}</th>
                <th scope="col" className="p-3">{r.thAttempts}</th>
                <th scope="col" className="p-3">{r.thDate}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr key={`${row.name}-${i}`} className="border-b border-border last:border-0">
                  <td className="p-3 text-muted-foreground">{i + 1}</td>
                  <td className="p-3 font-medium">{row.name}</td>
                  <td className="p-3 font-bold">{row.score} / {data.maxScore}</td>
                  <td className="p-3">{row.lastScore === null || row.lastMaxScore === null ? "—" : `${row.lastScore} / ${row.lastMaxScore}`}</td>
                  <td className="p-3">{row.attempts}</td>
                  <td className="p-3 text-muted-foreground">{new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : "ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      <Link href="/dashboard#assignments" className="text-sm underline">{r.back}</Link>
    </div>
  );
}
