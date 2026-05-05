import { notFound, redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { AssessmentView } from "@/components/assessments/assessment-view";
import { AutoPrint } from "@/components/ksp/auto-print";
import type { AssessmentPaperRow } from "@/lib/types/assessment";

export const dynamic = "force-dynamic";

export default async function PrintAssessmentPage({
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
  if (!user) redirect(`/login?next=/assessments/${id}/print`);

  const { data, error } = await supabase
    .from("assessment_papers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) notFound();
  const paper = data as AssessmentPaperRow;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <AutoPrint />
      <AssessmentView paper={paper} />
    </div>
  );
}
