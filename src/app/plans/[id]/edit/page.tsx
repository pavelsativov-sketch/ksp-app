import { notFound, redirect } from "next/navigation";
import { getPlanById, listSubjects } from "@/lib/plans-repo";
import { getCurrentUser } from "@/lib/auth";
import { PlanForm } from "@/components/ksp/plan-form";
import { listCurrentClasses } from "@/lib/classes";

export const dynamic = "force-dynamic";

const EDITOR_TABS = ["meta", "goals", "context", "flow", "evaluation"] as const;

export default async function EditPlanPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const requestedTab = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const initialTab = EDITOR_TABS.find((tab) => tab === requestedTab) ?? "meta";
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/plans/${id}/edit`);
  const typed = await getPlanById(id);
  if (!typed) notFound();
  if (typed.owner_id !== user.id) redirect(`/plans/${id}`);
  const [subjects, classes] = await Promise.all([
    listSubjects(),
    listCurrentClasses(user.id).catch(() => []),
  ]);

  return <div className="mx-auto max-w-[1200px] space-y-10 px-4 py-12 md:px-6 md:py-16">
    <header className="border-b border-[#ddd5cb] pb-7"><p className="editorial-kicker">Рабочая запись</p><h1 className="editorial-display mt-3 text-5xl">Редактирование КСП</h1><p className="mt-3 text-sm text-[#5f5751]">Сохранение доступно внизу журнала — черновик сохраняется локально во время работы.</p></header>
    <PlanForm initialTab={initialTab} subjects={subjects} classes={classes.map((c) => ({ id: c.id, name: c.name }))} initialPlan={{ id: typed.id, title: typed.title, subject_id: typed.subject_id, grade: typed.grade, quarter: typed.quarter, class_id: typed.class_id, section: typed.section, visibility: typed.visibility, language: typed.language, content: typed.content, updated_at: typed.updated_at }} />
  </div>;
}
