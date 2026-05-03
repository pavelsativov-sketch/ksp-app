import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, Plus } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { LessonSeriesRow } from "@/lib/types/ksp";

export const dynamic = "force-dynamic";

export default async function SeriesViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isSupabaseConfigured()) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/series/${id}`);

  const [{ data: srow }, { data: planRows }] = await Promise.all([
    supabase
      .from("lesson_series")
      .select("id, user_id, title, subject, grade, quarter, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("lesson_plans")
      .select("id, title, grade, quarter, updated_at, series_position, content, visibility")
      .eq("series_id", id)
      .order("series_position", { ascending: true, nullsFirst: false }),
  ]);

  if (!srow) notFound();
  const series = srow as LessonSeriesRow;
  // Owner-only access for the series overview (since lesson_series RLS is owner-all).
  if (series.user_id !== user.id) notFound();

  const plans =
    (planRows as Array<{
      id: string;
      title: string;
      grade: number;
      quarter: number | null;
      updated_at: string;
      series_position: number | null;
      visibility: "private" | "unlisted" | "public";
      content: { topic?: string } | null;
    }> | null) ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/dashboard"
            className="text-sm text-slate-500 hover:underline inline-flex items-center gap-1 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> К моим КСП
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold">
            Серия уроков: {series.title}
          </h1>
          <p className="text-slate-500 text-sm">
            {series.subject ? `${series.subject} · ` : ""}
            {series.grade ? `${series.grade} класс · ` : ""}
            {series.quarter ? `${series.quarter} четверть · ` : ""}
            {plans.length} {plans.length === 1 ? "урок" : "уроков"}
          </p>
        </div>
        <Button asChild>
          <Link href={`/plans/new?series=${series.id}`}>
            <Plus /> Добавить урок в серию
          </Link>
        </Button>
      </div>

      {plans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <FileText className="mx-auto text-slate-400 w-12 h-12" />
            <p className="font-medium text-slate-700">В серии пока нет уроков</p>
            <p className="text-sm text-slate-500">
              Создайте первый план — он автоматически станет уроком №1.
            </p>
            <Button asChild>
              <Link href={`/plans/new?series=${series.id}`}>
                <Plus /> Создать урок №1
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {plans.map((p, i) => {
            const positionLabel =
              p.series_position != null ? `Урок ${p.series_position}` : `Урок ${i + 1}`;
            return (
              <Card
                key={p.id}
                className="hover:shadow-sm transition-shadow border-slate-200"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="inline-flex items-center justify-center min-w-[32px] h-7 px-2 rounded-md bg-sky-100 text-sky-800 text-xs font-semibold">
                      {p.series_position ?? "—"}
                    </span>
                    <Link href={`/plans/${p.id}`} className="hover:underline">
                      {p.title}
                    </Link>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {positionLabel} · {p.grade} класс · обновлён{" "}
                    {formatDate(p.updated_at)}
                  </CardDescription>
                </CardHeader>
                {p.content?.topic && (
                  <CardContent className="pt-0 text-sm text-slate-600 line-clamp-2">
                    {p.content.topic}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
