import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAssignmentResults } from "@/lib/assignments";
import { AssignmentActions } from "@/components/assignments/assignment-actions";
import { Card, CardContent } from "@/components/ui/card";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AssignmentResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  const { id } = await params;
  const data = await getAssignmentResults(user.id, id).catch(() => null);
  if (!data) notFound();
  const { t } = await getDict();
  const r = t.assignments.results;

  const avg = data.rows.length
    ? (data.rows.reduce((s, r) => s + r.score, 0) / data.rows.length).toFixed(1)
    : "—";

  return (
    <div className="mx-auto max-w-[900px] space-y-8 px-4 py-12 md:px-6">
      <header className="border-b border-border pb-6">
        <p className="editorial-kicker">{r.kickerOpen} · код {data.code} · {data.status === "open" ? r.openW : r.closedW}</p>
        <h1 className="editorial-display mt-3 text-4xl">{data.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {r.passedW}: {data.rows.length} · {r.avgW}: {avg} / {data.maxScore}
        </p>
        <div className="mt-4">
          <AssignmentActions id={data.id} code={data.code} status={data.status} />
        </div>
      </header>
      {data.rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          {r.empty} {r.emptyHint} <span className="font-mono">/a/{data.code}</span>.
        </CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="p-3">{r.thNum}</th>
                <th className="p-3">{r.thStudent}</th>
                <th className="p-3">{r.thScore}</th>
                <th className="p-3">{r.thAttempts}</th>
                <th className="p-3">{r.thDate}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr key={`${row.name}-${i}`} className="border-b border-border last:border-0">
                  <td className="p-3 text-muted-foreground">{i + 1}</td>
                  <td className="p-3 font-medium">{row.name}</td>
                  <td className="p-3 font-bold">{row.score} / {data.maxScore}</td>
                  <td className="p-3">{row.attempts}</td>
                  <td className="p-3 text-muted-foreground">{new Date(row.createdAt).toLocaleString("ru-RU")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Link href="/dashboard#assignments" className="text-sm underline">{r.back}</Link>
    </div>
  );
}
