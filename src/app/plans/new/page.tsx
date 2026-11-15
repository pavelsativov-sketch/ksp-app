import Link from "next/link";
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
      </header>
      {/* Быстрый путь первым: большинству учителей хватает класса, предмета и темы. */}
      <Link href="/dashboard?new=1" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-primary-soft p-5">
        <span>
          <b className="block text-lg">Урок за один шаг</b>
          <span className="text-sm text-muted-foreground">Класс, предмет и тема: цели из ГОСО, ход урока и задания ИИ составит сам.</span>
        </span>
        <span className="rounded-control bg-ink px-4 py-2 text-sm font-bold text-white">Создать быстро</span>
      </Link>
      <details className="rounded-2xl border border-border bg-surface p-5" open={Boolean(selected)}>
        <summary className="cursor-pointer text-sm font-bold">Заполнить форму на готовом примере</summary>
        <div className="mt-4"><PlanOnboarding examples={examples} selectedKey={selected?.key} /></div>
      </details>
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
