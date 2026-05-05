import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { AssessmentForm } from "@/components/assessments/assessment-form";
import { getMyProfile } from "@/app/actions/profile";
import type { SubjectRow } from "@/lib/types/ksp";

export const dynamic = "force-dynamic";

export default async function NewAssessmentPage() {
  if (!isSupabaseConfigured()) redirect("/");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/assessments/new");

  const [{ data: subjects }, profile] = await Promise.all([
    supabase
      .from("subjects")
      .select("id, name_ru, name_kz, grade_min, grade_max")
      .order("name_ru"),
    getMyProfile(),
  ]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">
          Новое суммативное оценивание
        </h1>
        <p className="text-slate-500 text-sm">
          Выберите тип (СОР или СОЧ), укажите раздел и цели обучения, нажмите
          «Сгенерировать AI».
        </p>
      </div>
      <AssessmentForm
        subjects={(subjects as SubjectRow[] | null) ?? []}
        defaults={{
          teacherName: profile?.full_name ?? null,
          school: profile?.school ?? null,
        }}
        initialGrade={profile?.default_grade ?? undefined}
      />
    </div>
  );
}
