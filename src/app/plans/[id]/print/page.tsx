import { notFound, redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { PlanView } from "@/components/ksp/plan-view";
import { AutoPrint } from "@/components/ksp/auto-print";
import type { LessonPlanRow } from "@/lib/types/ksp";

export const dynamic = "force-dynamic";

/**
 * Print-friendly view of a plan that immediately opens the browser's print
 * dialog — perfect for "Save as PDF" without bundling a headless browser.
 *
 * URL: /plans/<id>/print
 *
 * The page reuses the existing PlanView (already styled with `print-plan` class
 * and the global @media print stylesheet) so the printed output matches the
 * .docx output: black borders, A4 margins, no chrome, no nav/footer.
 */
export default async function PlanPrintPage({
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

  // Visibility: same rules as plan-view (owner OR public).
  if (plan.visibility !== "public") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id !== plan.owner_id) notFound();
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <AutoPrint />
      <div className="no-print mb-4 text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
        Откроется системный диалог печати. Чтобы сохранить КСП в PDF — выберите
        в нём «Сохранить как PDF» (Chrome) или «PDF» как принтер (Safari).
      </div>
      <PlanView plan={plan} />
    </div>
  );
}
