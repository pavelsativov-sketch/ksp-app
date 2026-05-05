import { notFound, redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { AssessmentForm } from "@/components/assessments/assessment-form";
import type { AssessmentPaperRow } from "@/lib/types/assessment";
import type { SubjectRow } from "@/lib/types/ksp";

export const dynamic = "force-dynamic";

export default async function EditAssessmentPage({
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
  if (!user) redirect(`/login?next=/assessments/${id}/edit`);

  const [{ data: paperRaw, error }, { data: subjects }] = await Promise.all([
    supabase
      .from("assessment_papers")
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle(),
    supabase
      .from("subjects")
      .select("id, name_ru, name_kz, grade_min, grade_max")
      .order("name_ru"),
  ]);
  if (error || !paperRaw) notFound();
  const paper = paperRaw as AssessmentPaperRow;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold">
        Редактирование: {paper.title}
      </h1>
      <AssessmentForm
        subjects={(subjects as SubjectRow[] | null) ?? []}
        initial={paper}
      />
    </div>
  );
}
