import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Plus, Clock, BookOpen } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { isMongoConfigured } from "@/lib/mongo";
import { getLongTermPlan, getMediumTermPlans } from "@/lib/longterm";
import { DeletePlanButton } from "@/components/longterm/delete-plan-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LongTermDetailPage({ params }: PageProps) {
  const { id } = await params;
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

  const plan = await getLongTermPlan(id);
  if (!plan || plan.owner_id !== user.id) notFound();

  const mediumPlans = await getMediumTermPlans(user.id, { longTermId: id });

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

      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <p className="editorial-kicker">{d.kicker}</p>
          <h1 className="editorial-display mt-2 text-4xl">
            {plan.subject} — {plan.grade} класс
          </h1>
          <p className="mt-2 text-muted-foreground">
            {plan.year} · {totalTopics} {totalTopics === 1 ? "тема" : totalTopics < 5 ? "темы" : "тем"} · {totalHours} ч.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/longterm/${id}/medium/new`}>
              <Plus /> {d.createMedium}
            </Link>
          </Button>
          <DeletePlanButton
            endpoint="/api/longterm"
            id={id}
            confirmText="Удалить этот план? Связанные ССП также будут удалены."
            fallbackHref="/longterm"
          />
        </div>
      </div>

      {/* Progress */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <BookOpen className="size-4 text-muted-foreground" />
              <span>{plan.sections.length} {plan.sections.length === 1 ? "раздел" : "разделов"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              <span>{totalHours} ч.</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sections */}
      <div className="space-y-6">
        {plan.sections.map((section, sIdx) => (
          <Card key={sIdx}>
            <CardHeader>
              <CardTitle className="text-xl">{section.title}</CardTitle>
              <CardDescription>
                {section.topics.length} {section.topics.length === 1 ? "тема" : "тем"} ·{" "}
                {section.topics.reduce((sum, t) => sum + t.hours, 0)} ч.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {section.topics.map((topic, tIdx) => (
                  <div
                    key={tIdx}
                    className="flex items-start justify-between gap-4 rounded-xl border border-border p-4"
                  >
                    <div>
                      <p className="font-semibold">{topic.title}</p>
                      {topic.objectives && (
                        <p className="mt-1 text-sm text-muted-foreground">{topic.objectives}</p>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-sm text-muted-foreground">
                      {topic.hours} ч.
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Linked ССП */}
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
                  className="flex items-center justify-between rounded-xl border border-border p-4 hover:bg-primary-soft transition-colors"
                >
                  <div>
                    <p className="font-semibold">{mp.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {mp.quarter} четверть · {mp.topics.length} тем
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
