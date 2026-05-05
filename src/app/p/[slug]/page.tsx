/**
 * Public read-only view of a plan, accessed via its share slug.
 * Anyone with the URL — including unauthenticated visitors — can read it.
 *
 * Visibility rules (enforced via Postgres RLS, not just here):
 *   - public  → visible to anyone (was already supported pre-PR-12)
 *   - unlisted → visible to anyone holding the slug (added in 0008)
 *   - private  → 404 even with the slug
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { Download, Printer, BookOpen } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { PlanView } from "@/components/ksp/plan-view";
import type { LessonPlanRow } from "@/lib/types/ksp";

export const dynamic = "force-dynamic";

export default async function PublicPlanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isSupabaseConfigured()) notFound();
  if (!slug || slug.length < 6) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_plans")
    .select("*")
    .eq("slug", slug)
    .in("visibility", ["public", "unlisted"])
    .maybeSingle();

  if (error || !data) notFound();
  const plan = data as LessonPlanRow;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap no-print">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{plan.title}</h1>
          <p className="text-slate-500 text-sm">
            {plan.grade} класс ·{" "}
            {plan.visibility === "public" ? "публичный" : "по ссылке"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline">
            <a href={`/api/export/docx/${plan.id}`}>
              <Download /> Word
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href={`/plans/${plan.id}/print`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Printer /> PDF / печать
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <BookOpen /> О приложении
            </Link>
          </Button>
        </div>
      </div>
      <PlanView plan={plan} />
      <footer className="border-t border-slate-200 pt-4 text-center text-xs text-slate-500 no-print">
        План открыт по ссылке — для редактирования необходимо{" "}
        <Link
          href={`/login?next=/plans/${plan.id}/edit`}
          className="text-blue-600 hover:underline"
        >
          войти
        </Link>{" "}
        как владелец.
      </footer>
    </div>
  );
}
