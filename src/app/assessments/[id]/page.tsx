import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download, Edit, Printer } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { AssessmentView } from "@/components/assessments/assessment-view";
import type { AssessmentPaperRow } from "@/lib/types/assessment";

export const dynamic = "force-dynamic";

export default async function AssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isSupabaseConfigured()) redirect("/");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/assessments/${id}`);

  const { data, error } = await supabase
    .from("assessment_papers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) notFound();
  const paper = data as AssessmentPaperRow;

  const isOwner = paper.owner_id === user.id;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap no-print">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{paper.title}</h1>
          <p className="text-slate-500 text-sm">
            {paper.kind === "sor" ? "СОР · за раздел" : "СОЧ · за четверть"} ·{" "}
            {paper.grade} класс
            {paper.quarter ? ` · ${paper.quarter} четверть` : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isOwner && (
            <Button asChild variant="outline">
              <Link href={`/assessments/${paper.id}/edit`}>
                <Edit /> Редактировать
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <a href={`/api/export/assessment-docx/${paper.id}`}>
              <Download /> Word
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href={`/assessments/${paper.id}/print`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Printer /> PDF / печать
            </a>
          </Button>
        </div>
      </div>
      <AssessmentView paper={paper} />
    </div>
  );
}
