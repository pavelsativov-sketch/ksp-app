import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { FileText, Plus } from "lucide-react";
import { PlansFilter, type PlanListItem } from "@/components/ksp/plans-filter";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Настройка Supabase</CardTitle>
            <CardDescription>
              Для работы с базой данных добавьте переменные окружения в{" "}
              <code className="font-mono">.env.local</code>:
              <br />
              <code className="font-mono text-xs">
                NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
                SUPABASE_SERVICE_ROLE_KEY
              </code>
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");

  const [plansRes, subjectsRes] = await Promise.all([
    supabase
      .from("lesson_plans")
      .select("id, title, grade, subject_id, quarter, updated_at, visibility, content")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false }),
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
    visibility: "private" | "unlisted" | "public";
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
    visibility: p.visibility,
    topic: p.content?.topic ?? null,
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Мои КСП</h1>
          <p className="text-slate-500 text-sm">
            Все созданные вами краткосрочные планы.
          </p>
        </div>
        <Button asChild>
          <Link href="/plans/new">
            <Plus /> Создать КСП
          </Link>
        </Button>
      </div>

      {plans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <FileText className="mx-auto text-slate-400 w-12 h-12" />
            <div>
              <p className="font-medium text-slate-700">Пока нет ни одного КСП</p>
              <p className="text-sm text-slate-500 mt-1">
                Создайте свой первый план с помощью AI-помощника или заполните
                вручную.
              </p>
            </div>
            <Button asChild>
              <Link href="/plans/new">
                <Plus /> Создать первый КСП
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <PlansFilter
          plans={plans}
          subjects={subjects}
          showVisibility
          showEditLink
          emptyMessage="Пока нет КСП"
        />
      )}
    </div>
  );
}
