import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { listSubjects } from "@/lib/plans-repo";
import { listCurrentClasses } from "@/lib/classes";
import { templateAsPlanContent } from "@/lib/templates";
import { PlanForm } from "@/components/ksp/plan-form";
import { PlanOnboarding } from "@/components/ksp/plan-onboarding";
import { getPlanExamples } from "@/lib/plan-examples";
import { emptyKsp } from "@/lib/types/ksp";

export const dynamic = "force-dynamic";

export default async function NewPlanPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/plans/new");
  const { t } = await getDict();
  const np = t.planEditor.newPage;
  const [subjects, classes] = await Promise.all([
    listSubjects(),
    listCurrentClasses(user.id).catch(() => []),
  ]);
  const sp = await searchParams;
  const exampleKey = typeof sp.example === "string" ? sp.example : "";
  const examples = getPlanExamples(subjects);
  const selected = examples.find((e) => e.key === exampleKey);

  // Предзаполнение из онбординга (?topic=&subjectId=&grade=).
  const preTopic = typeof sp.topic === "string" ? sp.topic.slice(0, 300) : "";
  const preSubjectId = typeof sp.subjectId === "string" ? sp.subjectId : "";
  const preGrade = typeof sp.grade === "string" ? Number(sp.grade) : NaN;
  // Шаблон учителя (?templateId=&topic=): структура урока уже на месте.
  const templateId = typeof sp.templateId === "string" ? sp.templateId : "";
  const templateContent = templateId
    ? await templateAsPlanContent(user.id, templateId, preTopic).catch(() => null)
    : null;
  const basePlan = selected?.plan;
  const initialPlan = templateContent
    ? {
      ...basePlan,
      content: templateContent,
      grade: Number.isInteger(preGrade) && preGrade >= 1 && preGrade <= 11 ? preGrade : basePlan?.grade ?? 5,
    }
    : preTopic || (preSubjectId && subjects.some((s) => s.id === preSubjectId)) || Number.isInteger(preGrade)
    ? {
      ...basePlan,
      subject_id: preSubjectId && subjects.some((s) => s.id === preSubjectId) ? preSubjectId : basePlan?.subject_id,
      grade: Number.isInteger(preGrade) && preGrade >= 1 && preGrade <= 11 ? preGrade : basePlan?.grade,
      content: { ...(basePlan?.content ?? emptyKsp()), topic: preTopic || basePlan?.content?.topic || "" },
    }
    : basePlan;

  return (
    <div className="mx-auto max-w-[1200px] space-y-10 px-4 py-12 md:px-6 md:py-16">
      <header className="border-b border-border pb-7">
        <p className="editorial-kicker">{np.kicker}</p>
        <h1 className="editorial-display mt-3 text-5xl">{np.title}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          {np.lead}
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl+S</kbd>
            {np.saveShortcut}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl+Z</kbd>
            {np.undoShortcut}
          </span>
        </div>
      </header>
      <PlanOnboarding examples={examples} selectedKey={selected?.key} />
      <PlanForm
        key={selected?.key ?? "manual"}
        subjects={subjects}
        classes={classes.map((c) => ({ id: c.id, name: c.name }))}
        initialPlan={initialPlan}
        exampleKey={selected?.key}
      />
    </div>
  );
}
