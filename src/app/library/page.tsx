import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { PlansFilter, type PlanListItem } from "@/components/ksp/plans-filter";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Библиотека</CardTitle>
            <CardDescription>
              Библиотека доступна после настройки Supabase.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const [plansRes, subjectsRes] = await Promise.all([
    supabase
      .from("lesson_plans")
      .select("id, title, grade, subject_id, quarter, updated_at, content")
      .eq("visibility", "public")
      .order("updated_at", { ascending: false })
      .limit(120),
    supabase.from("subjects").select("id, name_ru").order("name_ru"),
  ]);

  const subjects = (subjectsRes.data as Array<{ id: string; name_ru: string }> | null) ?? [];
  const subjectMap = new Map(subjects.map((s) => [s.id, s.name_ru]));
  const rawPlans = (plansRes.data as Array<{
    id: string;
    title: string;
    grade: number;
    subject_id: string | null;
    quarter: number | null;
    updated_at: string;
    content: { topic?: string } | null;
  }> | null) ?? [];

  const plans: PlanListItem[] = rawPlans.map((p) => ({
    id: p.id,
    title: p.title,
    grade: p.grade,
    subject_id: p.subject_id,
    subject_name: p.subject_id ? subjectMap.get(p.subject_id) ?? null : null,
    quarter: p.quarter,
    updated_at: p.updated_at,
    topic: p.content?.topic ?? null,
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Библиотека КСП</h1>
        <p className="text-slate-500 text-sm">
          Публичные планы, которыми поделились учителя. Откройте, чтобы
          скопировать к себе.
        </p>
      </div>

      <PlansFilter
        plans={plans}
        subjects={subjects}
        emptyMessage="Пока нет публичных КСП. Опубликуйте свой первый план, чтобы поделиться с коллегами."
      />
    </div>
  );
}
