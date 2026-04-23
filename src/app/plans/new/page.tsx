import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { PlanForm } from "@/components/ksp/plan-form";
import type { SubjectRow } from "@/lib/types/ksp";

export const dynamic = "force-dynamic";

export default async function NewPlanPage() {
  if (!isSupabaseConfigured()) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/plans/new");

  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name_ru, name_kz, grade_min, grade_max")
    .order("name_ru");

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Новый КСП</h1>
        <p className="text-slate-500 text-sm">
          Заполните метаданные и нажмите «AI-заполнение» — помощник заполнит
          остальное.
        </p>
      </div>
      <PlanForm subjects={(subjects as SubjectRow[] | null) ?? []} />
    </div>
  );
}
