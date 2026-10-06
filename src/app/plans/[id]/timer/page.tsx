import Link from "next/link";
import { notFound } from "next/navigation";
import { getAccessiblePlan } from "@/lib/plans-repo";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LessonTimer } from "@/components/ksp/lesson-timer";
import { ArrowLeft, Clock, Play } from "lucide-react";


export const dynamic = "force-dynamic";

function parseStageMinutes(timeStr: string): number {
  if (!timeStr) return 10;
  // Try to extract first number from strings like "0–5 мин", "5 мин", "10-15 мин"
  const match = timeStr.match(/(\d+)/);
  if (match) return parseInt(match[1], 10) || 10;
  return 10;
}

export default async function LessonTimerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const { id } = await params;
  const { stage: stageParam } = await searchParams;
  const user = await getCurrentUser();
  const plan = await getAccessiblePlan(id, user?.id ?? null);
  if (!plan) notFound();

  const stages = [
    { key: "beginning", title: "Начало урока", stage: plan.content.stages.beginning },
    { key: "middle", title: "Середина урока", stage: plan.content.stages.middle },
    { key: "end", title: "Конец урока", stage: plan.content.stages.end },
  ];

  const totalMinutes = stages.reduce((sum, s) => sum + parseStageMinutes(s.stage.time), 0);

  return (
    <div className="mx-auto max-w-[900px] space-y-8 px-4 py-10 md:px-6 md:py-14">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#ddd5cb] pb-6">
        <div>
          <p className="editorial-kicker">Таймер урока</p>
          <h1 className="editorial-display mt-2 text-4xl">{plan.title}</h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-[#5f5751]">
            <Clock className="h-4 w-4" />
            {plan.grade} класс · ~{totalMinutes} мин
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/plans/${plan.id}`}>
            <ArrowLeft /> К плану
          </Link>
        </Button>
      </header>

      {/* Overall lesson timer */}
      <section className="space-y-4">
        <h2 className="editorial-display border-b border-[#ddd5cb] pb-2 text-2xl">
          Общий таймер урока
        </h2>
        <LessonTimer
          initialMinutes={totalMinutes}
          label="Весь урок"
        />
      </section>

      {/* Stage timers */}
      <section className="space-y-4">
        <h2 className="editorial-display border-b border-[#ddd5cb] pb-2 text-2xl">
          Таймеры по этапам
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {stages.map(({ key, title, stage }) => {
            const minutes = parseStageMinutes(stage.time);
            const isSelected = stageParam === key;
            return (
              <div
                key={key}
                className={`space-y-3 ${isSelected ? "ring-2 ring-primary ring-offset-2 rounded-xl" : ""}`}
              >
                <div className="rounded-card border border-border bg-surface p-4">
                  <h3 className="font-bold">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {stage.time || `${minutes} мин`}
                  </p>
                  {stage.teacherActions && (
                    <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                      {stage.teacherActions}
                    </p>
                  )}
                </div>
                <LessonTimer
                  initialMinutes={minutes}
                  label={title}
                  compact
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Quick start */}
      <section className="space-y-4">
        <h2 className="editorial-display border-b border-[#ddd5cb] pb-2 text-2xl">
          Быстрый старт
        </h2>
        <div className="flex flex-wrap gap-2">
          {stages.map(({ key, title, stage }) => {
            const minutes = parseStageMinutes(stage.time);
            return (
              <Button
                key={key}
                asChild
                variant="outline"
              >
                <Link href={`/plans/${plan.id}/timer?stage=${key}`}>
                  <Play className="h-4 w-4" />
                  {title} ({minutes} мин)
                </Link>
              </Button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
