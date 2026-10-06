import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock, FileText, Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { isMongoConfigured } from "@/lib/mongo";
import { getLongTermPlan, getMediumTermPlan } from "@/lib/longterm";
import { DeletePlanButton } from "@/components/longterm/delete-plan-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string; mediumId: string }>;
}

export default async function MediumTermDetailPage({ params }: PageProps) {
  const { id, mediumId } = await params;
  const { t } = await getDict();
  const d = t.longterm;

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

  const totalHours = mediumPlan.topics.reduce((sum, t) => sum + t.hours, 0);
  const totalKsp = mediumPlan.topics.reduce((sum, t) => sum + t.kspIds.length, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-16">
      <Button variant="ghost" asChild className="mb-6">
        <Link href={`/longterm/${id}`}>
          <ArrowLeft /> {d.backToLongTerm}
        </Link>
      </Button>

      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <p className="editorial-kicker">{d.mediumKicker}</p>
          <h1 className="editorial-display mt-2 text-4xl">{mediumPlan.title}</h1>
          <p className="mt-2 text-muted-foreground">
            {mediumPlan.quarter} четверть · {mediumPlan.topics.length} тем · {totalHours} ч. · {totalKsp} КСП
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href={`/api/mediumterm/export/${mediumId}`}>
              <FileText /> {d.exportWord}
            </a>
          </Button>
          <DeletePlanButton
            endpoint="/api/mediumterm"
            id={mediumId}
            confirmText="Удалить этот среднесрочный план?"
            fallbackHref={`/longterm/${id}`}
          />
        </div>
      </div>

      {/* Progress */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              <span>{totalHours} ч.</span>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              <span>{totalKsp} КСП</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Topics */}
      <div className="space-y-4">
        {mediumPlan.topics.map((topic, tIdx) => (
          <Card key={tIdx}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">{topic.title}</CardTitle>
                  <CardDescription>{topic.hours} ч.</CardDescription>
                </div>
                <span className="shrink-0 font-mono text-sm text-muted-foreground">
                  {topic.kspIds.length} КСП
                </span>
              </div>
            </CardHeader>
            {topic.kspIds.length > 0 && (
              <CardContent>
                <div className="space-y-2">
                  {topic.kspIds.map((kspId) => (
                    <Link
                      key={kspId}
                      href={`/plans/${kspId}`}
                      className="block rounded-xl border border-border p-3 hover:bg-primary-soft transition-colors"
                    >
                      <p className="text-sm font-semibold">КСП #{kspId.slice(-6)}</p>
                    </Link>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {mediumPlan.topics.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {d.noTopics}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
