import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, FileText } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import type { ObjectId } from "mongodb";
import { COL, getDb, isMongoConfigured, toObjectId } from "@/lib/mongo";
import { getLongTermPlan, getMediumTermPlan } from "@/lib/longterm";
import { DeletePlanButton } from "@/components/longterm/delete-plan-button";
import { KtpGenerateKspButton } from "@/components/longterm/ktp-generate-ksp-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string; mediumId: string }>;
}

export default async function MediumTermDetailPage({ params }: PageProps) {
  const { id, mediumId } = await params;
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

  const mediumPlan = await getMediumTermPlan(mediumId);
  if (!mediumPlan || mediumPlan.owner_id !== user.id) notFound();

  const longTermPlan = await getLongTermPlan(id);
  if (!longTermPlan || longTermPlan.owner_id !== user.id) notFound();

  const allKspIds = [...new Set(mediumPlan.topics.flatMap((topic) => topic.kspIds))];
  const oids = allKspIds.map(toObjectId).filter((v): v is NonNullable<typeof v> => v !== null);
  const kspTitleMap = new Map<string, string>();
  if (oids.length > 0) {
    const db = await getDb();
    const docs = await db
      .collection<{ _id: ObjectId; title?: string }>(COL.plans)
      .find({ _id: { $in: oids }, owner_id: user.id }, { projection: { title: 1 } })
      .toArray()
      .catch(() => []);
    for (const doc of docs) {
      kspTitleMap.set(String(doc._id), doc.title || `КСП #${String(doc._id).slice(-6)}`);
    }
  }

  const totalHours = mediumPlan.topics.reduce((sum, tp) => sum + tp.hours, 0);
  const totalKsp = mediumPlan.topics.reduce((sum, tp) => sum + tp.kspIds.length, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-16">
      <Button variant="ghost" asChild className="mb-6">
        <Link href={`/longterm/${id}`}>
          <ArrowLeft /> {d.backToLongTerm}
        </Link>
      </Button>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="editorial-kicker">{d.mediumKicker}</p>
          <h1 className="editorial-display mt-2 text-4xl">{mediumPlan.title}</h1>
          <p className="mt-2 text-muted-foreground">
            {longTermPlan.subject} ({longTermPlan.grade} {isKk ? "сынып" : "класс"}) ·{" "}
            {mediumPlan.quarter} {isKk ? "тоқсан" : "четверть"} · {mediumPlan.topics.length}{" "}
            {isKk ? "тақырып" : "тем"} · {totalHours} {isKk ? "сағ." : "ч."} · {totalKsp} КСП
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`/api/mediumterm/export/${mediumId}`}>
              <FileText /> {d.exportWord}
            </a>
          </Button>
          <DeletePlanButton
            endpoint="/api/mediumterm"
            id={mediumId}
            confirmText={
              isKk ? "Осы орта мерзімді жоспарды өшіру керек пе?" : "Удалить этот среднесрочный план?"
            }
            fallbackHref={`/longterm/${id}`}
          />
        </div>
      </div>

      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              <span>
                {totalHours} {isKk ? "сағ." : "ч."}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              <span>
                {totalKsp} {isKk ? "ҚМЖ дайын" : "КСП готово"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Интерактивный КТП на четверть: статус урока + создание КСП и комплекта в 1 клик */}
      <div className="space-y-4">
        {mediumPlan.topics.map((topic, tIdx) => {
          const prevTopic = tIdx > 0 ? mediumPlan.topics[tIdx - 1]?.title : undefined;
          return (
            <Card key={tIdx}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">
                      {tIdx + 1}. {topic.title}
                    </CardTitle>
                    <CardDescription>
                      {topic.hours} {isKk ? "сағ." : "ч."}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <KtpGenerateKspButton
                      subject={longTermPlan.subject}
                      grade={longTermPlan.grade}
                      topic={topic.title}
                      previousTopic={prevTopic}
                      mediumTermId={mediumId}
                      topicIndex={tIdx}
                      locale={locale}
                    />
                  </div>
                </div>
              </CardHeader>
              {topic.kspIds.length > 0 && (
                <CardContent>
                  <div className="space-y-2">
                    {topic.kspIds.map((kspId) => (
                      <Link
                        key={kspId}
                        href={`/plans/${kspId}`}
                        className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/10 dark:text-emerald-300"
                      >
                        <CheckCircle2 className="size-4 shrink-0" />
                        <span>{kspTitleMap.get(kspId) ?? `КСП #${kspId.slice(-6)}`}</span>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {mediumPlan.topics.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">{d.noTopics}</CardContent>
        </Card>
      )}
    </div>
  );
}
