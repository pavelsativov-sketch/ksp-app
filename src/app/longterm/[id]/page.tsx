import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Plus, Clock, BookOpen, CheckCircle2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { COL, getDb, isMongoConfigured } from "@/lib/mongo";
import { getLongTermPlan, getMediumTermPlans } from "@/lib/longterm";
import { DeletePlanButton } from "@/components/longterm/delete-plan-button";
import { KtpGenerateKspButton } from "@/components/longterm/ktp-generate-ksp-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

function normTitle(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export default async function LongTermDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { locale, t } = await getDict();
  const d = t.longterm;
  const isKk = locale === "kk";

  if (!isMongoConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="editorial-display text-3xl">{d.noMongoTitle}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/longterm");

  const plan = await getLongTermPlan(id);
  if (!plan || plan.owner_id !== user.id) notFound();

  const db = await getDb();
  const [mediumPlans, ownedPlans] = await Promise.all([
    getMediumTermPlans(user.id, { longTermId: id }),
    db
      .collection<{ _id: unknown; title?: string; content?: { topic?: string } }>(COL.plans)
      .find(
        { owner_id: user.id, grade: plan.grade },
        { projection: { title: 1, "content.topic": 1 } },
      )
      .limit(400)
      .toArray()
      .catch(() => []),
  ]);

  const kspByTopic = new Map<string, string>();
  for (const p of ownedPlans) {
    const pid = String(p._id);
    if (p.title) kspByTopic.set(normTitle(p.title), pid);
    if (p.content?.topic) kspByTopic.set(normTitle(p.content.topic), pid);
  }

  const totalHours = plan.sections.reduce(
    (sum, s) => sum + s.topics.reduce((tsum, t) => tsum + t.hours, 0),
    0,
  );
  const totalTopics = plan.sections.reduce((sum, s) => sum + s.topics.length, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-16">
      <Button variant="ghost" asChild className="mb-6">
        <Link href="/longterm">
          <ArrowLeft /> {d.back}
        </Link>
      </Button>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="editorial-kicker">{d.kicker}</p>
          <h1 className="editorial-display mt-2 text-4xl">
            {plan.subject} — {plan.grade} {isKk ? "сынып" : "класс"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {plan.year} · {totalTopics} {isKk ? "тақырып" : "тем"} · {totalHours} {isKk ? "сағ." : "ч."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/longterm/${id}/medium/new`}>
              <Plus /> {d.createMedium}
            </Link>
          </Button>
          <DeletePlanButton
            endpoint="/api/longterm"
            id={id}
            confirmText={
              isKk
                ? "Бұл жоспарды өшіру керек пе? Байланысты ОМЖ да өшіріледі."
                : "Удалить этот план? Связанные ССП также будут удалены."
            }
            fallbackHref="/longterm"
          />
        </div>
      </div>

      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <BookOpen className="size-4 text-muted-foreground" />
              <span>
                {plan.sections.length} {isKk ? "бөлім" : "разделов"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              <span>
                {totalHours} {isKk ? "сағ." : "ч."}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Разделы и темы ДСП/КТП с генерацией КСП в 1 клик */}
      <div className="space-y-6">
        {plan.sections.map((section, sIdx) => (
          <Card key={sIdx}>
            <CardHeader>
              <CardTitle className="text-xl">{section.title}</CardTitle>
              <CardDescription>
                {section.topics.length} {isKk ? "тақырып" : "тем"} ·{" "}
                {section.topics.reduce((sum, t) => sum + t.hours, 0)} {isKk ? "сағ." : "ч."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {section.topics.map((topic, tIdx) => {
                  const matchedKspId = kspByTopic.get(normTitle(topic.title));
                  const prevTopic = tIdx > 0 ? section.topics[tIdx - 1]?.title : undefined;
                  return (
                    <div
                      key={tIdx}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{topic.title}</p>
                        {topic.objectives && (
                          <p className="mt-1 text-sm text-muted-foreground">{topic.objectives}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                          {topic.hours} {isKk ? "сағ." : "ч."}
                        </span>
                        {matchedKspId ? (
                          <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs text-emerald-600">
                            <Link href={`/plans/${matchedKspId}`}>
                              <CheckCircle2 className="size-3.5" />
                              {isKk ? "ҚМЖ дайын → Ашу" : "КСП готов → Открыть"}
                            </Link>
                          </Button>
                        ) : (
                          <KtpGenerateKspButton
                            subject={plan.subject}
                            grade={plan.grade}
                            topic={topic.title}
                            objectives={topic.objectives}
                            previousTopic={prevTopic}
                            locale={locale}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {mediumPlans.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-xl">{d.linkedMedium}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {mediumPlans.map((mp) => (
                <Link
                  key={mp.id}
                  href={`/longterm/${id}/medium/${mp.id}`}
                  className="flex items-center justify-between rounded-xl border border-border p-4 transition-colors hover:bg-primary-soft"
                >
                  <div>
                    <p className="font-semibold">{mp.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {mp.quarter} {isKk ? "тоқсан" : "четверть"} · {mp.topics.length}{" "}
                      {isKk ? "тақырып" : "тем"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
