import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { PlanView } from "@/components/ksp/plan-view";
import { PrintButton } from "@/components/ksp/print-button";
import type { LessonPlanRow } from "@/lib/types/ksp";
import { Download, Edit, Printer } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PlanViewPage({
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = user?.id === plan.owner_id;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap no-print">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{plan.title}</h1>
          <p className="text-slate-500 text-sm">
            {plan.grade} класс · {plan.visibility}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isOwner && (
            <Button asChild variant="outline">
              <Link href={`/plans/${plan.id}/edit`}>
                <Edit /> Редактировать
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <a href={`/api/export/docx/${plan.id}`}>
              <Download /> Word
            </a>
          </Button>
          <PrintButton>
            <Printer /> PDF
          </PrintButton>
        </div>
      </div>
      <PlanView plan={plan} />
    </div>
  );
}
