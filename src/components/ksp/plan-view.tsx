"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, PencilLine, Save, Sparkles, Undo2 } from "lucide-react";
import type { KspContent, LessonPlanRow, LessonStage, StageKey } from "@/lib/types/ksp";
import { savePlanAction, getPlanConflictSnapshotAction } from "@/app/actions/plans";
import { TaskPlayer } from "./task-player";
import { QuizMode } from "./quiz-mode";
import { InlineListCell, InlineTextCell } from "./inline-plan-cell";
import { Button } from "@/components/ui/button";
import { taskTypeLabel } from "@/lib/ksp/tasks";
import { MathText } from "@/lib/math/render-math";

const LABELS = {
  ru: {
    kicker: "Краткосрочный план урока",
    quizBtn: (n: number) => `Пройти урок как квиз (${n} заданий)`,
    inlineHint: "Интерактивная таблица КСП: нажмите на любую ячейку, чтобы отредактировать текст или улучшить его с помощью ИИ прямо на месте.",
    unsaved: "Есть несохранённые правки в таблице КСП",
    save: "Сохранить КСП",
    saving: "Сохраняем…",
    saved: "Сохранено",
    discard: "Отменить правки",
    reloadLatest: "Загрузить свежую версию",
    sectionLtp: "Раздел долгосрочного плана",
    school: "Школа",
    date: "Дата",
    teacher: "ФИО педагога",
    grade: "Класс",
    attendance: "Присутствовало / Отсутствовало",
    topic: "Тема урока",
    learningObjectives: "Цели обучения (ГОСО)",
    lessonObjectives: "Цели урока",
    criteria: "Критерии оценивания",
    langGoals: "Языковые цели",
    terms: "Термины",
    phrases: "Ключевые фразы",
    values: "Привитие ценностей",
    crossLinks: "Межпредметные связи",
    prior: "Предшествующие знания",
    flow: "Ход урока",
    stageBeginning: "Начало урока",
    stageMiddle: "Середина урока",
    stageEnd: "Конец урока",
    colTime: "Время",
    colTeacher: "Действия педагога",
    colStudent: "Действия учеников",
    colAssessment: "Оценивание / дескрипторы",
    colResources: "Ресурсы",
    homework: "Домашнее задание",
    evalSection: "Оценивание и рефлексия",
    formative: "Формативное оценивание",
    diff: "Дифференциация и поддержка ООП",
    safety: "Здоровье и ТБ",
    reflection: "Рефлексия",
    interactiveCount: (n: number) => `Интерактивные задания этапа (${n})`,
    interactivePrint: "Интерактивные задания:",
  },
  kz: {
    kicker: "Қысқа мерзімді сабақ жоспары (ҚМЖ)",
    quizBtn: (n: number) => `Сабақты квиз ретінде өту (${n} тапсырма)`,
    inlineHint: "Интерактивті ҚМЖ кестесі: кез келген ұяшықты басып, мәтінді тікелей өңдеңіз немесе ЖИ көмегімен жақсартыңыз.",
    unsaved: "ҚМЖ кестесінде сақталмаған өзгерістер бар",
    save: "ҚМЖ сақтау",
    saving: "Сақталуда…",
    saved: "Сақталды",
    discard: "Өзгерістерді болдырмау",
    reloadLatest: "Жаңа нұсқаны жүктеу",
    sectionLtp: "Ұзақ мерзімді жоспар бөлімі",
    school: "Мектеп",
    date: "Күні",
    teacher: "Педагогтің аты-жөні",
    grade: "Сынып",
    attendance: "Қатысқандар / Қатыспағандар",
    topic: "Сабақтың тақырыбы",
    learningObjectives: "Оқу мақсаттары",
    lessonObjectives: "Сабақтың мақсаты",
    criteria: "Бағалау критерийлері",
    langGoals: "Тілдік мақсаттар",
    terms: "Терминдер",
    phrases: "Тіркестер",
    values: "Құндылықтарды дарыту",
    crossLinks: "Пәнаралық байланыс",
    prior: "Алдыңғы білім",
    flow: "Сабақтың барысы",
    stageBeginning: "Сабақтың басы",
    stageMiddle: "Сабақтың ортасы",
    stageEnd: "Сабақтың соңы",
    colTime: "Уақыты",
    colTeacher: "Педагогтің әрекеті",
    colStudent: "Оқушының әрекеті",
    colAssessment: "Бағалау / дескрипторлар",
    colResources: "Ресурстар",
    homework: "Үй тапсырмасы",
    evalSection: "Бағалау және рефлексия",
    formative: "Қалыптастырушы бағалау",
    diff: "Саралау және ЕБҚ қолдауы",
    safety: "Денсаулық және қауіпсіздік",
    reflection: "Рефлексия",
    interactiveCount: (n: number) => `Кезеңнің интерактивті тапсырмалары (${n})`,
    interactivePrint: "Интерактивті тапсырмалар:",
  },
} as const;

export function PlanView({
  plan,
  editable = false,
  subjectName = "",
}: {
  plan: LessonPlanRow;
  editable?: boolean;
  subjectName?: string;
}) {
  const router = useRouter();
  const lang: "ru" | "kz" = plan.language === "kz" ? "kz" : "ru";
  const L = LABELS[lang];

  const [draftContent, setDraftContent] = useState<KspContent | null>(null);
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const [updatedAtOverride, setUpdatedAtOverride] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [quizOpen, setQuizOpen] = useState(false);

  const dirty = draftContent !== null || draftTitle !== null;
  const content = draftContent ?? plan.content;
  const title = draftTitle ?? plan.title;
  const updatedAt = updatedAtOverride ?? plan.updated_at;

  const enhanceCtx = {
    topic: content.topic || title,
    subject: subjectName || "Общеобразовательный предмет",
    grade: plan.grade,
    language: lang,
  };

  function updateContent(updater: (prev: KspContent) => KspContent) {
    setDraftContent((prev) => updater(prev ?? plan.content));
    setSavedToast(false);
    setSaveError(null);
  }

  function updateStage(key: StageKey, patch: Partial<LessonStage>) {
    updateContent((prev) => ({
      ...prev,
      stages: {
        ...prev.stages,
        [key]: { ...prev.stages[key], ...patch },
      },
    }));
  }

  function discardChanges() {
    setDraftContent(null);
    setDraftTitle(null);
    setSaveError(null);
    setConflict(false);
  }

  function saveInlineChanges() {
    setSaveError(null);
    setConflict(false);
    startTransition(async () => {
      const nextTitle = (content.topic || title || plan.title).trim();
      const res = await savePlanAction({
        id: plan.id,
        title: nextTitle,
        subject_id: plan.subject_id,
        grade: plan.grade,
        quarter: plan.quarter,
        section: content.header.longTermPlanSection || plan.section,
        class_id: plan.class_id ?? null,
        visibility: plan.visibility,
        language: plan.language,
        content,
        expected_updated_at: updatedAt,
      });
      if ("error" in res) {
        setSaveError(res.error);
        if (res.code === "conflict") setConflict(true);
        return;
      }
      if (res.updated_at) setUpdatedAtOverride(res.updated_at);
      setDraftContent(null);
      setDraftTitle(null);
      setSavedToast(true);
      router.refresh();
    });
  }

  async function reloadLatestFromServer() {
    const snap = await getPlanConflictSnapshotAction(plan.id);
    if ("error" in snap) {
      setSaveError(snap.error);
      return;
    }
    setDraftContent(null);
    setDraftTitle(null);
    setUpdatedAtOverride(snap.updated_at);
    setConflict(false);
    setSaveError(null);
    router.refresh();
  }

  const c = content;
  const totalTasks =
    (c.stages.beginning.tasks?.length ?? 0) +
    (c.stages.middle.tasks?.length ?? 0) +
    (c.stages.end.tasks?.length ?? 0);

  return (
    <div className="print-plan space-y-8 rounded-2xl border border-border bg-surface p-5 md:p-8">
      {editable && (
        <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-xs">
          <span className="flex items-center gap-2 text-muted-foreground">
            <PencilLine className="size-4 shrink-0 text-primary" />
            <span>{dirty ? <strong className="text-foreground">{L.unsaved}</strong> : L.inlineHint}</span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {savedToast && !dirty && (
              <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                <Check className="size-3.5" /> {L.saved}
              </span>
            )}
            {dirty && (
              <>
                <Button type="button" size="sm" variant="ghost" onClick={discardChanges} disabled={isPending}>
                  <Undo2 className="size-3.5" /> {L.discard}
                </Button>
                <Button type="button" size="sm" onClick={saveInlineChanges} disabled={isPending}>
                  {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  {isPending ? L.saving : L.save}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {saveError && (
        <div role="alert" className="no-print flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            {saveError}
          </span>
          {conflict && (
            <Button type="button" size="sm" variant="outline" onClick={() => void reloadLatestFromServer()}>
              {L.reloadLatest}
            </Button>
          )}
        </div>
      )}

      <div className="border-b border-border pb-5 text-center">
        <p className="editorial-kicker">{L.kicker}</p>
        <h2 className="editorial-display mt-3 break-words text-3xl sm:text-4xl">
          <MathText text={c.topic || title} />
        </h2>
      </div>

      {totalTasks > 0 && (
        <div className="no-print flex justify-center">
          <Button
            type="button"
            size="lg"
            onClick={() => setQuizOpen(true)}
            className="bg-foreground hover:bg-foreground"
          >
            <Sparkles className="w-5 h-5" />
            {L.quizBtn(totalTasks)}
          </Button>
        </div>
      )}

      {quizOpen && (
        <QuizMode
          stages={[
            { stageKey: "beginning", stageTitle: L.stageBeginning, tasks: c.stages.beginning.tasks ?? [] },
            { stageKey: "middle", stageTitle: L.stageMiddle, tasks: c.stages.middle.tasks ?? [] },
            { stageKey: "end", stageTitle: L.stageEnd, tasks: c.stages.end.tasks ?? [] },
          ]}
          onClose={() => setQuizOpen(false)}
        />
      )}

      {/* Шапка КСП */}
      <div className="overflow-x-auto border-y border-border">
        <table className="w-full text-sm">
          <tbody>
            <HeaderRow label={L.sectionLtp}>
              <InlineTextCell
                value={c.header.longTermPlanSection}
                editable={editable}
                multiline={false}
                language={lang}
                onCommit={(v) => updateContent((p) => ({ ...p, header: { ...p.header, longTermPlanSection: v } }))}
              />
            </HeaderRow>
            <HeaderRow label={L.school}>
              <InlineTextCell
                value={c.header.school}
                editable={editable}
                multiline={false}
                language={lang}
                onCommit={(v) => updateContent((p) => ({ ...p, header: { ...p.header, school: v } }))}
              />
            </HeaderRow>
            <HeaderRow label={L.date}>
              <InlineTextCell
                value={c.header.date}
                editable={editable}
                multiline={false}
                language={lang}
                onCommit={(v) => updateContent((p) => ({ ...p, header: { ...p.header, date: v } }))}
              />
            </HeaderRow>
            <HeaderRow label={L.teacher}>
              <InlineTextCell
                value={c.header.teacherName}
                editable={editable}
                multiline={false}
                language={lang}
                onCommit={(v) => updateContent((p) => ({ ...p, header: { ...p.header, teacherName: v } }))}
              />
            </HeaderRow>
            <HeaderRow label={L.grade}>
              <InlineTextCell
                value={c.header.grade || String(plan.grade)}
                editable={editable}
                multiline={false}
                language={lang}
                onCommit={(v) => updateContent((p) => ({ ...p, header: { ...p.header, grade: v } }))}
              />
            </HeaderRow>
            <HeaderRow label={L.attendance}>
              <span>{`${c.header.studentsPresent ?? "—"} / ${c.header.studentsAbsent ?? "—"}`}</span>
            </HeaderRow>
            <HeaderRow label={L.topic}>
              <InlineTextCell
                value={c.topic}
                editable={editable}
                multiline={false}
                language={lang}
                onCommit={(v) => {
                  setDraftTitle(v || title);
                  updateContent((p) => ({ ...p, topic: v }));
                }}
              />
            </HeaderRow>
          </tbody>
        </table>
      </div>

      <Section title={L.learningObjectives}>
        {c.learningObjectives.length > 0 ? (
          <ul className="list-disc space-y-1 pl-6">
            {c.learningObjectives.map((o, i) => (
              <li key={o.code || i}>
                {o.code && <span className="tabular-nums text-muted-foreground">{o.code} — </span>}
                <MathText text={o.text} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="italic text-muted-foreground">—</p>
        )}
      </Section>

      <Section title={L.lessonObjectives}>
        <InlineListCell
          items={c.lessonObjectives}
          editable={editable}
          language={lang}
          enhanceSection="lessonObjectives"
          enhanceContext={enhanceCtx}
          onCommit={(next) => updateContent((p) => ({ ...p, lessonObjectives: next }))}
        />
      </Section>

      <Section title={L.criteria}>
        <InlineListCell
          items={c.assessmentCriteria}
          editable={editable}
          language={lang}
          enhanceSection="assessmentCriteria"
          enhanceContext={enhanceCtx}
          onCommit={(next) => updateContent((p) => ({ ...p, assessmentCriteria: next }))}
        />
      </Section>

      <Section title={L.langGoals}>
        <div className="space-y-2">
          <div>
            <strong>{L.terms}: </strong>
            <InlineTextCell
              value={c.languageObjectives.terms.join(", ")}
              editable={editable}
              multiline={false}
              language={lang}
              enhanceSection="languageObjectivesTerms"
              enhanceContext={enhanceCtx}
              onCommit={(v) =>
                updateContent((p) => ({
                  ...p,
                  languageObjectives: {
                    ...p.languageObjectives,
                    terms: v.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
                  },
                }))
              }
            />
          </div>
          <div>
            <strong>{L.phrases}: </strong>
            <InlineTextCell
              value={c.languageObjectives.phrases.join("; ")}
              editable={editable}
              language={lang}
              enhanceSection="languageObjectivesPhrases"
              enhanceContext={enhanceCtx}
              onCommit={(v) =>
                updateContent((p) => ({
                  ...p,
                  languageObjectives: {
                    ...p.languageObjectives,
                    phrases: v.split(/[;\n]/).map((s) => s.trim()).filter(Boolean),
                  },
                }))
              }
            />
          </div>
        </div>
      </Section>

      <Section title={L.values}>
        <InlineTextCell
          value={c.values}
          editable={editable}
          language={lang}
          enhanceSection="values"
          enhanceContext={enhanceCtx}
          onCommit={(v) => updateContent((p) => ({ ...p, values: v }))}
        />
      </Section>

      <Section title={L.crossLinks}>
        <InlineTextCell
          value={c.crossCurricularLinks}
          editable={editable}
          language={lang}
          enhanceSection="crossCurricularLinks"
          enhanceContext={enhanceCtx}
          onCommit={(v) => updateContent((p) => ({ ...p, crossCurricularLinks: v }))}
        />
      </Section>

      <Section title={L.prior}>
        <InlineTextCell
          value={c.priorKnowledge}
          editable={editable}
          language={lang}
          enhanceSection="priorKnowledge"
          enhanceContext={enhanceCtx}
          onCommit={(v) => updateContent((p) => ({ ...p, priorKnowledge: v }))}
        />
      </Section>

      <Section title={L.flow}>
        <StageTable
          stageKey="beginning"
          title={L.stageBeginning}
          stage={c.stages.beginning}
          editable={editable}
          lang={lang}
          enhanceCtx={enhanceCtx}
          onChange={(patch) => updateStage("beginning", patch)}
        />
        <StageTable
          stageKey="middle"
          title={L.stageMiddle}
          stage={c.stages.middle}
          editable={editable}
          lang={lang}
          enhanceCtx={enhanceCtx}
          onChange={(patch) => updateStage("middle", patch)}
        />
        <StageTable
          stageKey="end"
          title={L.stageEnd}
          stage={c.stages.end}
          editable={editable}
          lang={lang}
          enhanceCtx={enhanceCtx}
          onChange={(patch) => updateStage("end", patch)}
          showHomework
        />
      </Section>

      <Section title={L.evalSection}>
        <div className="space-y-2.5">
          <div>
            <strong>{L.formative}: </strong>
            <InlineTextCell
              value={c.evaluation.formativeAssessment}
              editable={editable}
              language={lang}
              enhanceSection="formativeAssessment"
              enhanceContext={enhanceCtx}
              onCommit={(v) => updateContent((p) => ({ ...p, evaluation: { ...p.evaluation, formativeAssessment: v } }))}
            />
          </div>
          <div>
            <strong>{L.diff}: </strong>
            <InlineTextCell
              value={c.evaluation.differentiation}
              editable={editable}
              language={lang}
              enhanceSection="differentiation"
              enhanceContext={enhanceCtx}
              onCommit={(v) => updateContent((p) => ({ ...p, evaluation: { ...p.evaluation, differentiation: v } }))}
            />
          </div>
          <div>
            <strong>{L.safety}: </strong>
            <InlineTextCell
              value={c.evaluation.healthAndSafety}
              editable={editable}
              language={lang}
              enhanceSection="healthAndSafety"
              enhanceContext={enhanceCtx}
              onCommit={(v) => updateContent((p) => ({ ...p, evaluation: { ...p.evaluation, healthAndSafety: v } }))}
            />
          </div>
          <div>
            <strong>{L.reflection}: </strong>
            <InlineTextCell
              value={c.evaluation.reflection}
              editable={editable}
              language={lang}
              enhanceSection="reflection"
              enhanceContext={enhanceCtx}
              onCommit={(v) => updateContent((p) => ({ ...p, evaluation: { ...p.evaluation, reflection: v } }))}
            />
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="editorial-display border-b border-border pb-2 text-2xl">{title}</h2>
      <div className="space-y-1 break-words text-sm">{children}</div>
    </section>
  );
}

function HeaderRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-[#eee7de]">
      <td className="w-1/3 py-2.5 pr-3 align-top font-medium text-muted-foreground">{label}</td>
      <td className="py-2 align-top">{children}</td>
    </tr>
  );
}

function StageTable({
  stageKey,
  title,
  stage,
  editable,
  lang,
  enhanceCtx,
  onChange,
  showHomework,
}: {
  stageKey: StageKey;
  title: string;
  stage: LessonStage;
  editable: boolean;
  lang: "ru" | "kz";
  enhanceCtx: { topic: string; subject: string; grade: number; language: "ru" | "kz" };
  onChange: (patch: Partial<LessonStage>) => void;
  showHomework?: boolean;
}) {
  const L = LABELS[lang];
  const tasks = stage.tasks ?? [];
  const assessmentValue = [
    stage.assessmentMethod ? stage.assessmentMethod : "",
    ...(stage.descriptors ?? []),
  ]
    .filter(Boolean)
    .join("\n");

  const commitAssessment = (raw: string) => {
    const lines = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    onChange({
      assessmentMethod: lines[0] ?? "",
      descriptors: lines.slice(1),
    });
  };

  return (
    <div className="space-y-2">
      <h3 className="mt-5 border-l-2 border-ink pl-3 font-bold">{title}</h3>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[700px] border border-border text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="w-[11%] border border-border p-2 text-left">{L.colTime}</th>
              <th className="w-[31%] border border-border p-2 text-left">{L.colTeacher}</th>
              <th className="w-[26%] border border-border p-2 text-left">{L.colStudent}</th>
              <th className="w-[18%] border border-border p-2 text-left">{L.colAssessment}</th>
              <th className="w-[14%] border border-border p-2 text-left">{L.colResources}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-border p-2 align-top">
                <InlineTextCell
                  value={stage.time}
                  editable={editable}
                  multiline={false}
                  language={lang}
                  onCommit={(v) => onChange({ time: v })}
                />
              </td>
              <td className="border border-border p-2 align-top">
                <InlineTextCell
                  value={stage.teacherActions}
                  editable={editable}
                  language={lang}
                  enhanceSection="teacherActions"
                  enhanceStage={stageKey}
                  enhanceContext={enhanceCtx}
                  onCommit={(v) => onChange({ teacherActions: v })}
                />
              </td>
              <td className="border border-border p-2 align-top">
                <InlineTextCell
                  value={stage.studentActions}
                  editable={editable}
                  language={lang}
                  enhanceSection="studentActions"
                  enhanceStage={stageKey}
                  enhanceContext={enhanceCtx}
                  onCommit={(v) => onChange({ studentActions: v })}
                />
              </td>
              <td className="border border-border p-2 align-top">
                <InlineTextCell
                  value={assessmentValue}
                  editable={editable}
                  language={lang}
                  enhanceSection="descriptors"
                  enhanceStage={stageKey}
                  enhanceContext={enhanceCtx}
                  onCommit={commitAssessment}
                />
              </td>
              <td className="border border-border p-2 align-top">
                <InlineTextCell
                  value={stage.resources}
                  editable={editable}
                  language={lang}
                  enhanceSection="resources"
                  enhanceStage={stageKey}
                  enhanceContext={enhanceCtx}
                  onCommit={(v) => onChange({ resources: v })}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Мобильное представление этапа */}
      <dl className="grid gap-2 sm:hidden">
        <div className="rounded-lg border border-border bg-surface p-3">
          <dt className="text-xs font-semibold text-muted-foreground">{L.colTime}</dt>
          <dd className="mt-1 text-sm">
            <InlineTextCell value={stage.time} editable={editable} multiline={false} language={lang} onCommit={(v) => onChange({ time: v })} />
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <dt className="text-xs font-semibold text-muted-foreground">{L.colTeacher}</dt>
          <dd className="mt-1 text-sm">
            <InlineTextCell value={stage.teacherActions} editable={editable} language={lang} enhanceSection="teacherActions" enhanceStage={stageKey} enhanceContext={enhanceCtx} onCommit={(v) => onChange({ teacherActions: v })} />
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <dt className="text-xs font-semibold text-muted-foreground">{L.colStudent}</dt>
          <dd className="mt-1 text-sm">
            <InlineTextCell value={stage.studentActions} editable={editable} language={lang} enhanceSection="studentActions" enhanceStage={stageKey} enhanceContext={enhanceCtx} onCommit={(v) => onChange({ studentActions: v })} />
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <dt className="text-xs font-semibold text-muted-foreground">{L.colAssessment}</dt>
          <dd className="mt-1 text-sm">
            <InlineTextCell value={assessmentValue} editable={editable} language={lang} enhanceSection="descriptors" enhanceStage={stageKey} enhanceContext={enhanceCtx} onCommit={commitAssessment} />
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <dt className="text-xs font-semibold text-muted-foreground">{L.colResources}</dt>
          <dd className="mt-1 text-sm">
            <InlineTextCell value={stage.resources} editable={editable} language={lang} enhanceSection="resources" enhanceStage={stageKey} enhanceContext={enhanceCtx} onCommit={(v) => onChange({ resources: v })} />
          </dd>
        </div>
      </dl>

      {(showHomework || stage.homework) && (
        <div className="rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm">
          <strong>{L.homework}: </strong>
          <InlineTextCell
            value={stage.homework ?? ""}
            editable={editable}
            language={lang}
            enhanceSection="homework"
            enhanceStage={stageKey}
            enhanceContext={enhanceCtx}
            onCommit={(v) => onChange({ homework: v })}
          />
        </div>
      )}

      {tasks.length > 0 && (
        <div className="no-print mt-3 space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {L.interactiveCount(tasks.length)}
          </p>
          {tasks.map((task) => (
            <div key={task.id} className="border border-border bg-muted p-4">
              <TaskPlayer task={task} />
            </div>
          ))}
        </div>
      )}
      {tasks.length > 0 && (
        <div className="hidden space-y-1 text-xs print:block">
          <p className="font-medium">{L.interactivePrint}</p>
          <ol className="list-decimal space-y-1 pl-5">
            {tasks.map((t) => (
              <li key={t.id}>
                <span className="text-muted-foreground">[{taskTypeLabel(t.type)}]</span>{" "}
                <MathText text={t.question} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
