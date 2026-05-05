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
import { ClipboardCheck, FileText, FileUp, Plus } from "lucide-react";
import { PlansFilter, type PlanListItem } from "@/components/ksp/plans-filter";
import { buildPlanSearchText } from "@/lib/ksp/search-text";
import type { KspContent } from "@/lib/types/ksp";
import type { AssessmentKind } from "@/lib/types/assessment";

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

  const [plansRes, subjectsRes, seriesRes, assessmentsRes] = await Promise.all([
    supabase
      .from("lesson_plans")
      .select(
        "id, title, grade, subject_id, quarter, language, updated_at, visibility, content, series_id, series_position",
      )
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase.from("subjects").select("id, name_ru").order("name_ru"),
    supabase
      .from("lesson_series")
      .select("id, title, subject, grade, quarter, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("assessment_papers")
      .select(
        "id, kind, title, grade, subject_id, quarter, section, total_points, updated_at",
      )
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(60),
  ]);

  const assessments =
    (assessmentsRes.data as Array<{
      id: string;
      kind: AssessmentKind;
      title: string;
      grade: number;
      subject_id: string | null;
      quarter: number | null;
      section: string | null;
      total_points: number | null;
      updated_at: string;
    }> | null) ?? [];

  const seriesList =
    (seriesRes.data as Array<{
      id: string;
      title: string;
      subject: string | null;
      grade: number | null;
      quarter: number | null;
      created_at: string;
    }> | null) ?? [];

  const subjects = (subjectsRes.data as Array<{ id: string; name_ru: string }> | null) ?? [];
  const subjectMap = new Map(subjects.map((s) => [s.id, s.name_ru]));
  const rawPlans = (plansRes.data as Array<{
    id: string;
    title: string;
    grade: number;
    subject_id: string | null;
    quarter: number | null;
    language: "ru" | "kz" | null;
    updated_at: string;
    visibility: "private" | "unlisted" | "public";
    content: KspContent | null;
    series_id: string | null;
    series_position: number | null;
  }> | null) ?? [];

  // Count plans per series so we can show "5 уроков" on the series card.
  const seriesCounts = new Map<string, number>();
  for (const p of rawPlans) {
    if (!p.series_id) continue;
    seriesCounts.set(p.series_id, (seriesCounts.get(p.series_id) ?? 0) + 1);
  }

  const plans: PlanListItem[] = rawPlans.map((p) => ({
    id: p.id,
    title: p.title,
    grade: p.grade,
    subject_id: p.subject_id,
    subject_name: p.subject_id ? subjectMap.get(p.subject_id) ?? null : null,
    quarter: p.quarter,
    language: p.language ?? undefined,
    updated_at: p.updated_at,
    visibility: p.visibility,
    topic: p.content?.topic ?? null,
    search_text: buildPlanSearchText(p.content),
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
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/plans/new">
              <Plus /> Создать КСП
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/assessments/new">
              <ClipboardCheck /> СОР / СОЧ
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/plans/import">
              <FileUp /> Импорт .docx
            </Link>
          </Button>
        </div>
      </div>

      {assessments.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-700">
              Суммативные оценивания
            </h2>
            <Link
              href="/assessments/new"
              className="text-xs text-blue-600 hover:underline"
            >
              + новое СОР / СОЧ
            </Link>
          </div>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {assessments.map((a) => (
              <Link
                key={a.id}
                href={`/assessments/${a.id}`}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      a.kind === "sor"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-violet-50 text-violet-700 border border-violet-200"
                    }`}
                  >
                    {a.kind === "sor" ? "СОР" : "СОЧ"}
                  </span>
                  <div className="font-medium text-sm text-slate-800 line-clamp-1">
                    {a.title}
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {a.grade} класс
                  {a.quarter ? ` · ${a.quarter} четв.` : ""}
                  {a.section ? ` · ${a.section}` : ""}
                  {a.total_points != null
                    ? ` · ${a.total_points} б.`
                    : ""}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {seriesList.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-700">
            Серии уроков
          </h2>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {seriesList.map((s) => (
              <Link
                key={s.id}
                href={`/series/${s.id}`}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                <div className="font-medium text-sm text-slate-800 line-clamp-1">
                  {s.title}
                </div>
                <div className="text-xs text-slate-500">
                  {s.subject ? `${s.subject} · ` : ""}
                  {s.grade ? `${s.grade} класс · ` : ""}
                  {seriesCounts.get(s.id) ?? 0}{" "}
                  {(seriesCounts.get(s.id) ?? 0) === 1 ? "урок" : "уроков"}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

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
