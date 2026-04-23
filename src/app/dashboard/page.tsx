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
import { formatDate } from "@/lib/utils";

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

  const { data: plans } = await supabase
    .from("lesson_plans")
    .select("id, title, grade, subject_id, updated_at, visibility")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
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

      {plans && plans.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((p) => (
            <Card key={p.id} className="hover:border-blue-400 transition-colors">
              <CardHeader>
                <CardTitle className="text-lg line-clamp-2">
                  <Link href={`/plans/${p.id}`} className="hover:underline">
                    {p.title}
                  </Link>
                </CardTitle>
                <CardDescription className="text-xs flex gap-2 items-center">
                  <span>{p.grade} класс</span>
                  <span>•</span>
                  <span>{formatDate(p.updated_at)}</span>
                  <span>•</span>
                  <span className="capitalize">{p.visibility}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2 pt-0">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/plans/${p.id}`}>Открыть</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/plans/${p.id}/edit`}>Редактировать</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
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
      )}
    </div>
  );
}
