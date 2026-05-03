import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { PlanForm } from "@/components/ksp/plan-form";
import { getMyProfile } from "@/app/actions/profile";
import type { LessonSeriesRow, SubjectRow } from "@/lib/types/ksp";

export const dynamic = "force-dynamic";

export default async function NewPlanPage({
  searchParams,
}: {
  searchParams?: Promise<{ series?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/plans/new");

  const sp = (await searchParams) ?? {};

  const [{ data: subjects }, { data: seriesList }, profile] = await Promise.all([
    supabase
      .from("subjects")
      .select("id, name_ru, name_kz, grade_min, grade_max")
      .order("name_ru"),
    supabase
      .from("lesson_series")
      .select("id, user_id, title, subject, grade, quarter, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    getMyProfile(),
  ]);

  // Pre-fill the lesson header with the teacher's saved profile defaults so
  // they don't have to retype school/ФИО for every new plan. Passed as a
  // separate prop so the form can apply them ON TOP of any restored draft.
  const profileDefaults = {
    teacherName: profile?.full_name ?? null,
    school: profile?.school ?? null,
  };
  const initialGrade = profile?.default_grade ?? undefined;

  // If ?series=<id> is supplied, suggest the next position for new plan in that series.
  let presetSeriesId: string | null = null;
  let presetPosition: number | null = null;
  if (sp.series) {
    presetSeriesId = sp.series;
    const { data: existing } = await supabase
      .from("lesson_plans")
      .select("series_position")
      .eq("series_id", sp.series)
      .eq("owner_id", user.id);
    const positions = (existing ?? [])
      .map((p) => (p as { series_position: number | null }).series_position)
      .filter((p): p is number => typeof p === "number");
    presetPosition = positions.length === 0 ? 1 : Math.max(...positions) + 1;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Новый КСП</h1>
        <p className="text-slate-500 text-sm">
          Заполните метаданные и нажмите «AI-заполнение» — помощник заполнит
          остальное.
        </p>
      </div>
      <PlanForm
        subjects={(subjects as SubjectRow[] | null) ?? []}
        seriesList={(seriesList as LessonSeriesRow[] | null) ?? []}
        presetSeriesId={presetSeriesId}
        presetSeriesPosition={presetPosition}
        profileDefaults={profileDefaults}
        initialPlan={initialGrade ? { grade: initialGrade } : undefined}
      />
    </div>
  );
}
