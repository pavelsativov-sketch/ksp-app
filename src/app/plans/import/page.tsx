import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { ImportDocxForm } from "@/components/ksp/import-docx-form";
import { getMyProfile } from "@/app/actions/profile";
import type { SubjectRow } from "@/lib/types/ksp";

export const dynamic = "force-dynamic";

export default async function ImportPlanPage() {
  if (!isSupabaseConfigured()) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/plans/import");

  const [{ data: subjects }, profile] = await Promise.all([
    supabase
      .from("subjects")
      .select("id, name_ru, name_kz, grade_min, grade_max")
      .order("name_ru"),
    getMyProfile(),
  ]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Импорт КСП из Word</h1>
        <p className="text-slate-500 text-sm mt-1">
          Загрузите готовый <code>.docx</code>-файл — AI разберёт его на этапы,
          цели, дескрипторы и заполнит форму. Затем останется проверить и
          сохранить.{" "}
          <Link href="/plans/new" className="text-blue-600 hover:underline">
            Создать с нуля →
          </Link>
        </p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <ImportDocxForm
          subjects={(subjects as SubjectRow[] | null) ?? []}
          defaultGrade={profile?.default_grade ?? undefined}
        />
      </div>
    </div>
  );
}
