import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import type { LessonPlanRow } from "@/lib/types/ksp";

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
  const { data } = await supabase
    .from("lesson_plans")
    .select("id, title, grade, subject_id, updated_at, content")
    .eq("visibility", "public")
    .order("updated_at", { ascending: false })
    .limit(60);

  const plans = (data as LessonPlanRow[] | null) ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Библиотека КСП</h1>
        <p className="text-slate-500 text-sm">
          Публичные планы, которыми поделились учителя. Откройте, чтобы
          скопировать к себе.
        </p>
      </div>

      {plans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            Пока нет публичных КСП. Опубликуйте свой первый план, чтобы
            поделиться с коллегами.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="text-lg line-clamp-2">
                  <Link href={`/plans/${p.id}`} className="hover:underline">
                    {p.title}
                  </Link>
                </CardTitle>
                <CardDescription className="text-xs">
                  {p.grade} класс · {formatDate(p.updated_at)}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <p className="text-sm text-slate-600 line-clamp-3">
                  {p.content?.topic}
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/plans/${p.id}`}>Открыть</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
