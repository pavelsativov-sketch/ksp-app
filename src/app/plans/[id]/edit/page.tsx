import { notFound, redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { PlanForm } from "@/components/ksp/plan-form";
import type { LessonPlanRow, SubjectRow } from "@/lib/types/ksp";

export const dynamic = "force-dynamic";

export default async function EditPlanPage({
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
  if (!user) redirect(`/login?next=/plans/${id}/edit`);

  const { data: plan } = await supabase
    .from("lesson_plans")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!plan) notFound();
  const typed = plan as LessonPlanRow;
  if (typed.owner_id !== user.id) redirect(`/plans/${id}`);

  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name_ru, name_kz, grade_min, grade_max")
    .order("name_ru");

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Редактирование КСП</h1>
      </div>
      <PlanForm
        subjects={(subjects as SubjectRow[] | null) ?? []}
        initialPlan={{
          id: typed.id,
          title: typed.title,
          subject_id: typed.subject_id,
          grade: typed.grade,
          quarter: typed.quarter,
          section: typed.section,
          visibility: typed.visibility,
          language: typed.language,
          content: typed.content,
        }}
      />
    </div>
  );
}
