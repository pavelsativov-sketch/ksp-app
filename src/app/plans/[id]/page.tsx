import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { PlanView } from "@/components/ksp/plan-view";
import { ClonePlanButton } from "@/components/ksp/clone-plan-button";
import { SeriesNav } from "@/components/ksp/series-nav";
import { PlanHistoryButton } from "@/components/ksp/plan-history";
import type { LessonPlanRow, LessonSeriesRow } from "@/lib/types/ksp";
import { Archive, Download, Edit, Plus, Printer } from "lucide-react";
import { ShareDialog } from "@/components/ksp/share-dialog";
import { StartSessionButton } from "@/components/ksp/start-session-button";

export const dynamic = "force-dynamic";

export default async function PlanViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isSupabaseConfigured()) redirect("/");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_plans")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();
  const plan = data as LessonPlanRow;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = user?.id === plan.owner_id;

  let series: LessonSeriesRow | null = null;
  let seriesPlans: Array<{ id: string; title: string; series_position: number | null }> = [];
  if (plan.series_id) {
    const [{ data: srow }, { data: peers }] = await Promise.all([
      supabase
        .from("lesson_series")
        .select("id, user_id, title, subject, grade, quarter, created_at")
        .eq("id", plan.series_id)
        .maybeSingle(),
      supabase
        .from("lesson_plans")
        .select("id, title, series_position")
        .eq("series_id", plan.series_id)
        .order("series_position", { ascending: true, nullsFirst: false }),
    ]);
    series = (srow as LessonSeriesRow | null) ?? null;
    seriesPlans =
      (peers as Array<{
        id: string;
        title: string;
        series_position: number | null;
      }> | null) ?? [];
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap no-print">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{plan.title}</h1>
          <p className="text-slate-500 text-sm">
            {plan.grade} класс · {plan.visibility}
            {series && plan.series_position && (
              <>
                {" · "}
                <span className="text-sky-700 font-medium">
                  Урок {plan.series_position}
                  {seriesPlans.length > 0 ? ` из ${seriesPlans.length}` : ""}
                  {" — "}
                  {series.title}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isOwner && (
            <Button asChild variant="outline">
              <Link href={`/plans/${plan.id}/edit`}>
                <Edit /> Редактировать
              </Link>
            </Button>
          )}
          {isOwner && <PlanHistoryButton planId={plan.id} isOwner={isOwner} />}
          {isOwner && (
            <ShareDialog
              planId={plan.id}
              initialSlug={plan.slug ?? null}
              initialVisibility={plan.visibility}
            />
          )}
          {isOwner && <StartSessionButton planId={plan.id} />}
          {user && <ClonePlanButton planId={plan.id} />}
          <Button asChild variant="outline">
            <a href={`/api/export/docx/${plan.id}`}>
              <Download /> Word
            </a>
          </Button>
          <Button asChild>
            <a href={`/api/export/zip/${plan.id}`}>
              <Archive /> Пакет (.zip)
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href={`/plans/${plan.id}/print`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Открыть печатную версию для сохранения в PDF"
            >
              <Printer /> PDF / печать
            </a>
          </Button>
        </div>
      </div>
      {series && (
        <div className="no-print flex items-center gap-3 flex-wrap rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2">
          <SeriesNav
            currentId={plan.id}
            seriesTitle={series.title}
            plans={seriesPlans}
          />
          <div className="ml-auto flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/series/${plan.series_id}`}>Все уроки серии</Link>
            </Button>
            {isOwner && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/plans/new?series=${plan.series_id}`}>
                  <Plus className="w-3.5 h-3.5" /> Добавить урок в серию
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
      <PlanView plan={plan} />
    </div>
  );
}
