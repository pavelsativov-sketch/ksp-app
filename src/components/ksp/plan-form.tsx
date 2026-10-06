"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Save, Loader2, Check, AlertTriangle, Undo2, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  type KspContent,
  type Visibility,
  type Language,
  type SchoolProfile,
  emptyKsp,
  type SubjectRow,
} from "@/lib/types/ksp";
import { ObjectivesPicker } from "./objectives-picker";
import { AiEnhanceButton } from "./ai-enhance-button";
import { GlossaryButton } from "./glossary-button";
import { TextbookPicker } from "./textbook-picker";
import { mergeAiIntoKsp } from "@/lib/ai/merge";
import {
  savePlanAction,
  saveDraftAction,
  type SavePlanInput,
} from "@/app/actions/plans";
import { ListEditor } from "./list-editor";
import { StageEditor } from "./stage-editor";
import { computeProgress, collectWarnings } from "@/lib/ksp/plan-progress";
import { usePlanDraft } from "./hooks/use-plan-draft";
import { usePlanAi } from "./hooks/use-plan-ai";
import { PlanSidebar, type SidebarSection } from "./plan-sidebar";
import { AiLoadingOverlay } from "./ai-loading";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import { fill, type Dict } from "@/lib/i18n/dictionaries";

interface PlanFormProps {
  initialPlan?: Partial<SavePlanInput> & { id?: string; updated_at?: string };
  subjects: SubjectRow[];
  /** Классы и группы учителя для привязки плана. */
  classes?: Array<{ id: string; name: string }>;
  /** Isolates example local drafts without assigning a server plan ID. */
  exampleKey?: string;
}

/** Элемент диффа AI-результата: что изменится при применении. */
interface DiffItem {
  label: string;
  filled: boolean; // true — поле было пустым; false — перезапись
  preview: string; // начало нового значения
}
type ContentDiff = DiffItem[];

/** Сравнивает контент до/после AI: список изменённых полей для подтверждения. */
function diffContent(before: KspContent, after: KspContent, t: Dict): ContentDiff {
  const out: ContentDiff = [];
  const str = (v: unknown): string => (Array.isArray(v) ? v.map(String).join("; ") : String(v ?? ""));
  const push = (label: string, b: unknown, a: unknown) => {
    const bs = str(b).trim();
    const as = str(a).trim();
    if (!as || as === bs) return;
    out.push({ label, filled: !bs, preview: as.slice(0, 140) + (as.length > 140 ? "…" : "") });
  };
  const d = t.planEditor.diff;
  push(d.topic, before.topic, after.topic);
  push(d.lessonObjectives, before.lessonObjectives, after.lessonObjectives);
  push(d.criteria, before.assessmentCriteria, after.assessmentCriteria);
  push(d.terms, before.languageObjectives?.terms, after.languageObjectives?.terms);
  push(d.phrases, before.languageObjectives?.phrases, after.languageObjectives?.phrases);
  push(d.values, before.values, after.values);
  push(d.links, before.crossCurricularLinks, after.crossCurricularLinks);
  push(d.prior, before.priorKnowledge, after.priorKnowledge);
  const stageNames = {
    beginning: d.stageBeginning,
    middle: d.stageMiddle,
    end: d.stageEnd,
  } as const;
  (Object.keys(stageNames) as Array<keyof typeof stageNames>).forEach((key) => {
    const b = before.stages[key];
    const a = after.stages[key];
    if (!b || !a) return;
    const name = stageNames[key];
    push(`${name}: ${d.time}`, b.time, a.time);
    push(`${name}: ${d.teacherWords}`, b.teacherActions, a.teacherActions);
    push(`${name}: ${d.studentActions}`, b.studentActions, a.studentActions);
    push(`${name}: ${d.resources}`, b.resources, a.resources);
    push(`${name}: ${d.questions}`, b.keyQuestions, a.keyQuestions);
    push(`${name}: ${d.descriptors}`, b.descriptors, a.descriptors);
    push(`${name}: ${d.assessment}`, b.assessmentMethod, a.assessmentMethod);
    const bt = (b.tasks ?? []).length;
    const at = (a.tasks ?? []).length;
    if (at > 0 && (at !== bt || JSON.stringify(b.tasks) !== JSON.stringify(a.tasks))) {
      out.push({
        label: `${name}: ${fill(d.tasks, { n: at })}`,
        filled: bt === 0,
        preview: (a.tasks ?? []).map((task) => task.question).join("; ").slice(0, 140),
      });
    }
  });
  push(d.homework, before.stages.end?.homework, after.stages.end?.homework);
  push(d.summary, before.stages.end?.summary, after.stages.end?.summary);
  push(d.formative, before.evaluation?.formativeAssessment, after.evaluation?.formativeAssessment);
  push(d.differentiation, before.evaluation?.differentiation, after.evaluation?.differentiation);
  push(d.health, before.evaluation?.healthAndSafety, after.evaluation?.healthAndSafety);
  push(d.reflection, before.evaluation?.reflection, after.evaluation?.reflection);
  return out;
}

/** Этапы долгой генерации — честные подписи без фейковых процентов. */
function aiSteps(t: Dict): string[] {
  return t.planEditor.aiSteps;
}

export function PlanForm({ initialPlan, subjects, classes = [], exampleKey }: PlanFormProps) {
  const router = useRouter();
  const { t } = useUiLocale();
  const pe = t.planEditor;
  const expectedUpdatedAt = useRef(initialPlan?.updated_at);
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  /**
   * Код подсказки под ошибкой сохранения.
   *
   * Раньше подсказка выбиралась поиском русской подстроки в тексте ошибки
   * (`saveError.includes("профиль школы")`). При казахском интерфейсе текст
   * ошибки переведён, подстрока не совпадала — и подсказка молча пропадала.
   * Теперь условие задаётся кодом, а не текстом.
   */
  const [saveErrorHint, setSaveErrorHint] = useState<"metaProfile" | "goalsTopic" | "metaTitle" | null>(null);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [activeTab, setActiveTab] = useState<string>("meta");
  const [showValidation, setShowValidation] = useState(false);
  const [textbookId, setTextbookId] = useState<string | null>(null);
  // Снапшот контента до AI-заполнения — для кнопки «Отменить».
  const aiUndoRef = useRef<KspContent | null>(null);
  const [aiApplied, setAiApplied] = useState(false);
  const [aiFilledCount, setAiFilledCount] = useState(0);
  const [refundState, setRefundState] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [refundMessage, setRefundMessage] = useState("");
  // AI-результат, ожидающий подтверждения: показываем дифф до применения.
  const [pendingAi, setPendingAi] = useState<{ merged: KspContent; diff: ContentDiff } | null>(null);
  const [aiStep, setAiStep] = useState(0);
  const { state, setState, draftSaved, clearDraft } = usePlanDraft(initialPlan?.id ?? (exampleKey ? `example:${exampleKey}` : undefined), {
    id: initialPlan?.id,
    title: initialPlan?.title ?? "",
    subjectId: initialPlan?.subject_id ?? subjects[0]?.id ?? "",
    grade: initialPlan?.grade ?? 5,
    quarter: initialPlan?.quarter ?? null,
    classId: initialPlan?.class_id ?? "",
    section: initialPlan?.section ?? "",
    visibility: (initialPlan?.visibility as Visibility) ?? "private",
    language: (initialPlan?.language as Language) ?? "ru",
    content: initialPlan?.content ?? emptyKsp(),
  });
  
  const { id: planId, title, subjectId, grade, quarter, classId, section, visibility, language, content } = state;
  const schoolProfile = content.schoolProfile ?? "";

  // ── Серверный черновик: сохраняет недозаполненный план на сервере ──
  async function saveDraft() {
    setDraftStatus("saving");
    try {
      const res = await saveDraftAction({
        id: planId,
        expected_updated_at: expectedUpdatedAt.current,
        title,
        subject_id: subjectId || null,
        grade,
        quarter,
        class_id: classId || null,
        section: section || null,
        visibility: "private",
        language,
        content,
      });
      if ("error" in res) {
        setDraftStatus("error");
        setSaveError(res.error);
      } else {
        // Запоминаем id нового плана, чтобы повторное сохранение обновляло
        // тот же документ, а не плодило дубликаты.
        setState((prev) => ({ ...prev, id: res.id }));
        expectedUpdatedAt.current = res.updated_at;
        setDraftStatus("saved");
        clearDraft();
      }
    } catch {
      setDraftStatus("error");
      setSaveError(pe.errors.draftFailed);
    }
  }

  // Setters to keep JSX intact
  const setTitle = (title: string) => setState(prev => ({ ...prev, title }));
  const setSubjectId = (subjectId: string) => setState(prev => ({ ...prev, subjectId }));
  const setGrade = (grade: number) => setState(prev => ({ ...prev, grade }));
  const setQuarter = (quarter: number | null) => setState(prev => ({ ...prev, quarter }));
  const setSection = (section: string) => setState(prev => ({ ...prev, section }));
  const setVisibility = (visibility: Visibility) => setState(prev => ({ ...prev, visibility }));
  const setLanguage = (language: Language) => setState(prev => ({ ...prev, language }));
  const setContent = (newContentOrUpdater: KspContent | ((prev: KspContent) => KspContent)) => {
    setState(prev => ({
      ...prev,
      content: typeof newContentOrUpdater === 'function' ? newContentOrUpdater(prev.content) : newContentOrUpdater
    }));
  };

  const { generateWithAi, aiLoading, aiError, ragNote, quotaRemaining, cancelAi } = usePlanAi();

  // Профиль школы берём из localStorage только пока он не выбран пользователем
  // (и не восстановлен из серверного черновика). Единый источник истины —
  // state.content.schoolProfile, поэтому восстановление не затирает выбор.
  useEffect(() => {
    if (schoolProfile) return;
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem("ksp-school-profile");
        if (saved === "emn" || saved === "ogn") {
          setState((prev) =>
            prev.content.schoolProfile ? prev : {
              ...prev,
              content: { ...prev.content, schoolProfile: saved },
            },
          );
        }
      } catch {
        // Storage is optional; the user can choose a profile in the form.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [schoolProfile, setState]);

  function chooseSchoolProfile(profile: SchoolProfile) {
    setContent((prev) => ({ ...prev, schoolProfile: profile }));
    try {
      window.localStorage.setItem("ksp-school-profile", profile);
    } catch {
      // The plan itself still retains the selected profile.
    }
  }

  // Живой прогресс долгой генерации: подписи этапов вместо висящего спиннера.
  const steps = aiSteps(t);
  useEffect(() => {
    if (!aiLoading) return;
    const timer = window.setInterval(() => {
      setAiStep((s) => Math.min(s + 1, steps.length - 1));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [aiLoading, steps]);

  const subjectName = subjects.find((s) => s.id === subjectId)?.name_ru ?? pe.subjectFallback;

  const progress = useMemo(() => computeProgress(content, title), [content, title]);
  const warnings = useMemo(
    () => collectWarnings({ title, topic: content.topic, content }, pe.warningItems),
    [title, content, pe.warningItems],
  );

  // ── Sidebar sections: completion status per tab ──
  const sidebarSections: SidebarSection[] = useMemo(() => {
    const isNonEmptyStr = (v: unknown) => typeof v === "string" && v.trim().length > 0;
    const isNonEmptyArr = (v: unknown) => Array.isArray(v) && v.length > 0;
    return [
      {
        id: "meta",
        label: pe.tabs.meta,
        completed: isNonEmptyStr(title) && !!schoolProfile,
        active: activeTab === "meta",
      },
      {
        id: "goals",
        label: pe.tabs.goals,
        completed: isNonEmptyStr(content.topic) && isNonEmptyArr(content.learningObjectives),
        active: activeTab === "goals",
      },
      {
        id: "context",
        label: pe.tabs.context,
        completed: isNonEmptyStr(content.values) || isNonEmptyStr(content.priorKnowledge),
        active: activeTab === "context",
      },
      {
        id: "flow",
        label: pe.tabs.flow,
        completed: isNonEmptyStr(content.stages?.beginning?.teacherActions) ||
          isNonEmptyStr(content.stages?.middle?.teacherActions) ||
          isNonEmptyStr(content.stages?.end?.teacherActions),
        active: activeTab === "flow",
      },
      {
        id: "evaluation",
        label: pe.tabs.evaluation,
        completed: isNonEmptyStr(content.evaluation?.formativeAssessment) ||
          isNonEmptyStr(content.evaluation?.reflection),
        active: activeTab === "evaluation",
      },
    ];
  }, [title, schoolProfile, content, activeTab, pe.tabs]);

  // ── Keyboard shortcuts: Ctrl+S = save, Ctrl+Z = undo AI ──
  const saveRef = useRef<() => void>(() => {});
  const undoAiRef = useRef<() => void>(() => {});
  const saveBusyRef = useRef(false);
  // Свежие ссылки на обработчики пишутся в эффекте: доступ к ref во время
  // рендера запрещён правилом react-hooks/refs.
  useEffect(() => {
    saveRef.current = save;
    undoAiRef.current = undoAiGenerate;
    saveBusyRef.current = isPending || draftStatus === "saving";
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts when typing in inputs (except Ctrl+S)
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        // Пока сохранение в полёте — игнорируем: повторный Ctrl+S дублировал
        // бы план (id ещё не присвоен) или ловил PLAN_CONFLICT.
        if (!saveBusyRef.current) saveRef.current();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !isInput) {
        e.preventDefault();
        undoAiRef.current();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleAiGenerate() {
    // Предупреждение о профиле школы для 10-11 классов (критично для ТУП).
    if (!schoolProfile && (grade === 10 || grade === 11)) {
      setSaveError(pe.errors.schoolProfileRequired);
      setActiveTab("meta");
      return;
    }
    setSaveError(null);
    setAiStep(0);
    const aiContent = await generateWithAi({
      grade,
      subjectName,
      topic: content.topic,
      // Коды целей важны для привязки: AI размечает ими задания и дескрипторы.
      learningObjectives: content.learningObjectives.map((o) => (o.code ? `${o.code} — ${o.text}` : o.text)),
      language,
      schoolProfile: schoolProfile || undefined,
      textbookId,
    });

    if (aiContent) {
      const merged = mergeAiIntoKsp(content, aiContent);
      const diff = diffContent(content, merged, t);
      if (diff.length === 0) {
        setSaveError(pe.errors.aiNoChanges);
        return;
      }
      // Показываем дифф: учитель решает, применять ли результат.
      setPendingAi({ merged, diff });
    }
  }

  function applyPendingAi() {
    if (!pendingAi) return;
    aiUndoRef.current = content;
    setContent(pendingAi.merged);
    setAiFilledCount(pendingAi.diff.length);
    setAiApplied(true);
    setPendingAi(null);
    setRefundState("idle");
    setRefundMessage("");
  }

  /** Возврат попытки: результат не подошёл — слот квоты возвращается. */
  async function refundGeneration() {
    setRefundState("pending");
    setRefundMessage("");
    try {
      const res = await fetch("/api/ai/refund", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || pe.errors.refundFailed);
      setRefundState("done");
      setRefundMessage(
        typeof data.remaining === "number"
          ? fill(pe.errors.refundDoneCount, { n: data.remaining })
          : pe.errors.refundDone,
      );
    } catch (e) {
      setRefundState("error");
      setRefundMessage(e instanceof Error ? e.message : pe.errors.refundFailed);
    }
  }

  function undoAiGenerate() {
    if (!aiUndoRef.current) return;
    setContent(aiUndoRef.current);
    aiUndoRef.current = null;
    setAiApplied(false);
  }

  /** Сколько полей AI реально заполнил — для подтверждающей подписи. */
  /** Сколько полей AI реально заполнил — для подтверждающей подписи. */
  function save() {
    setSaveError(null);
    setSaveErrorHint(null);
    setShowValidation(true);
    if (!title.trim()) {
      setActiveTab("meta");
      setSaveError(pe.errors.titleRequired);
      setSaveErrorHint("metaTitle");
      return;
    }
    if (!content.topic.trim()) {
      setActiveTab("goals");
      setSaveError(pe.errors.topicRequired);
      setSaveErrorHint("goalsTopic");
      return;
    }
    if (!schoolProfile) {
      setActiveTab("meta");
      setSaveError(pe.errors.schoolProfileSave);
      setSaveErrorHint("metaProfile");
      return;
    }
    const payload: SavePlanInput = {
      id: planId,
      expected_updated_at: expectedUpdatedAt.current,
      title: title.trim(),
      subject_id: subjectId || null,
      grade: Number(grade),
      quarter,
      class_id: classId || null,
      section: section || null,
      visibility,
      language,
      content: { ...content, schoolProfile: schoolProfile as SchoolProfile },
    };
    startTransition(async () => {
      const res = await savePlanAction(payload);
      if ("error" in res && res.error) {
        setSaveError(res.error);
      } else if ("id" in res && res.id) {
        expectedUpdatedAt.current = res.updated_at;
        clearDraft();
        router.push(`/plans/${res.id}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <PlanSidebar
        sections={sidebarSections}
        onSectionClick={setActiveTab}
        progress={progress}
      />

      <div className="min-w-0 flex-1 space-y-6">
        {showValidation && warnings.length > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-[#dbc7a7] bg-[#f8eedc] p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#9b651f]" />
            <div className="text-sm text-[#745329]">
              <p className="font-medium mb-1">
                Проверьте незаполненные важные разделы ({warnings.length}):
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="sticky top-3 z-10 rounded-2xl border border-border bg-surface/95 p-4 backdrop-blur">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{fill(pe.progress, { percent: progress.percent, done: progress.done, total: progress.total })}</span>
            <span className="flex items-center gap-1 text-[#2f5b4f]">
              {draftSaved && (
                <>
                  <Check className="w-3 h-3" /> {pe.draftSavedBadge}
                </>
              )}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap md:flex-nowrap">
          <TabsTrigger value="meta">{pe.tabs.meta}</TabsTrigger>
          <TabsTrigger value="goals">{pe.tabs.goals}</TabsTrigger>
          <TabsTrigger value="context">{pe.tabs.context}</TabsTrigger>
          <TabsTrigger value="flow">{pe.tabs.flow}</TabsTrigger>
          <TabsTrigger value="evaluation">{pe.tabs.evaluation}</TabsTrigger>
        </TabsList>

        <TabsContent value="meta" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{pe.meta.title}</CardTitle>
          <CardDescription>
            {pe.meta.desc}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <Label>{pe.meta.schoolProfile} <span className="text-red-500">*</span></Label>
            <Select value={schoolProfile} onValueChange={(value) => chooseSchoolProfile(value as SchoolProfile)}>
              <SelectTrigger aria-label={pe.meta.schoolProfile}>
                <SelectValue placeholder={pe.meta.schoolProfilePh} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="emn">{pe.meta.emn}</SelectItem>
                <SelectItem value="ogn">{pe.meta.ogn}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{pe.meta.schoolProfileHint}</p>
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <Label htmlFor="title">
              {pe.meta.planTitle} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={pe.meta.planTitlePh}
              className={showValidation && !title.trim() ? "border-red-400 focus-visible:ring-red-400" : ""}
              aria-invalid={showValidation && !title.trim()}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{pe.meta.subject}</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger>
                <SelectValue placeholder={pe.meta.subjectPh} />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name_ru}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="grade">{pe.meta.grade}</Label>
              <Input
                id="grade"
                type="number"
                min={1}
                max={11}
                value={grade}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  // Схема сохранения допускает 1–11 (zod) — не даём ввести 12,
                  // чтобы ошибка не всплывала только при сохранении.
                  if (Number.isInteger(next) && next >= 1 && next <= 11) setGrade(next);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quarter">{pe.meta.quarter}</Label>
              <Input
                id="quarter"
                type="number"
                min={1}
                max={4}
                value={quarter ?? ""}
                onChange={(e) =>
                  setQuarter(e.target.value ? Number(e.target.value) : null)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{pe.meta.language}</Label>
              <Select
                value={language}
                onValueChange={(v) => setLanguage(v as "ru" | "kz")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ru">{pe.meta.langRu}</SelectItem>
                  <SelectItem value="kz">{pe.meta.langKz}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="section">{pe.meta.section}</Label>
            <Input
              id="section"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder={pe.meta.sectionPh}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{pe.meta.classGroup}</Label>
            <Select
              value={classId || "none"}
              onValueChange={(v) => setState((prev) => ({ ...prev, classId: v === "none" ? "" : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder={pe.meta.noClass} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{pe.meta.noClass}</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {classes.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {pe.meta.classesHint}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>{pe.meta.visibility}</Label>
            <Select
              value={visibility}
              onValueChange={(v) =>
                setVisibility(v as "private" | "unlisted" | "public")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">{pe.meta.visPrivate}</SelectItem>
                <SelectItem value="unlisted">{pe.meta.visUnlisted}</SelectItem>
                <SelectItem value="public">{pe.meta.visPublic}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="goals" className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col items-start justify-between gap-4 sm:flex-row">
          <div>
            <CardTitle>{pe.goals.topicTitle}</CardTitle>
            <CardDescription>
              {pe.goals.topicDesc}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                onClick={handleAiGenerate}
                disabled={aiLoading}
              >
                {aiLoading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Sparkles />
                )}
                {pe.goals.aiFill}
              </Button>
              {aiApplied && !aiLoading && (
                <Button type="button" variant="outline" onClick={undoAiGenerate}>
                  {pe.goals.aiUndo}
                </Button>
              )}
            </div>
            <TextbookPicker
              value={textbookId}
              onChange={setTextbookId}
              grade={grade}
            />
            {aiApplied && !aiLoading && aiFilledCount > 0 && (
              <div className="text-xs text-emerald-700">
                {fill(pe.goals.aiFilled, { n: aiFilledCount })}
              </div>
            )}
            {aiApplied && !aiLoading && refundState !== "done" && (
              <button
                type="button"
                onClick={() => void refundGeneration()}
                disabled={refundState === "pending"}
                className="text-xs text-slate-500 underline hover:text-slate-700 disabled:opacity-50"
              >
                {refundState === "pending" ? pe.goals.refunding : pe.goals.refundPrompt}
              </button>
            )}
            {refundMessage && (
              <div className={`text-xs ${refundState === "error" ? "text-red-600" : "text-emerald-700"}`} role="status">
                {refundMessage}
              </div>
            )}
            {aiLoading && (
              <div className="text-xs text-slate-600" role="status" aria-live="polite">
                {aiSteps(t)[aiStep]} {pe.aiTiming}
              </div>
            )}
            {quotaRemaining !== undefined && quotaRemaining !== null && (
              <div className="text-xs text-muted-foreground">
                {pe.goals.quotaLeft} <strong>{quotaRemaining}</strong>
              </div>
            )}
            {ragNote && (
              <div className="text-xs text-emerald-700">{ragNote}</div>
            )}
            {aiError && (
              <div className="text-xs text-red-600">{aiError}</div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={content.topic}
            onChange={(e) =>
              setContent((prev) => ({ ...prev, topic: e.target.value }))
            }
            placeholder={pe.goals.topicPh}
            className={showValidation && !content.topic.trim() ? "border-red-400 focus-visible:ring-red-400" : ""}
            aria-invalid={showValidation && !content.topic.trim()}
          />
          {aiError && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
              {aiError}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{pe.goals.objectivesTitle}</CardTitle>
          <CardDescription>
            {pe.goals.objectivesDesc}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ObjectivesPicker
            subjectId={subjectId}
            subjectName={subjectName}
            grade={grade}
            schoolProfile={schoolProfile || undefined}
            selectedCodes={content.learningObjectives
              .map((o) => o.code)
              .filter(Boolean)}
            onAdd={(rows) =>
              setContent((prev) => ({ ...prev,                 learningObjectives: [
                  ...content.learningObjectives,
                  ...rows.filter(
                    (r) =>
                      !content.learningObjectives.some((o) => o.code === r.code),
                  ),
                ],
              }))
            }
          />
          <ListEditor
            items={content.learningObjectives.map(
              (o) => `${o.code}${o.code ? " — " : ""}${o.text}`,
            )}
            onChange={(items) =>
              setContent((prev) => ({ ...prev,                 learningObjectives: items.map((raw) => {
                  const m = raw.match(/^([\d.]+)\s*[-—]\s*(.+)$/);
                  return m
                    ? { code: m[1], text: m[2] }
                    : { code: "", text: raw };
                }),
              }))
            }
            placeholder={pe.goals.objectivesPh}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle>{pe.goals.smartTitle}</CardTitle>
          <AiEnhanceButton
            section="lessonObjectives"
            current={content.lessonObjectives}
            onApply={(improved) =>
              setContent((prev) => ({ ...prev, lessonObjectives: improved }))
            }
            context={{ topic: content.topic, subject: subjectName, grade, language }}
          />
        </CardHeader>
        <CardContent>
          <ListEditor
            items={content.lessonObjectives}
            onChange={(items) =>
              setContent((prev) => ({ ...prev, lessonObjectives: items }))
            }
            placeholder={pe.goals.smartPh}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle>{pe.goals.criteriaTitle}</CardTitle>
          <AiEnhanceButton
            section="assessmentCriteria"
            current={content.assessmentCriteria}
            onApply={(improved) =>
              setContent((prev) => ({ ...prev, assessmentCriteria: improved }))
            }
            context={{ topic: content.topic, subject: subjectName, grade, language }}
          />
        </CardHeader>
        <CardContent>
          <ListEditor
            items={content.assessmentCriteria}
            onChange={(items) =>
              setContent((prev) => ({ ...prev, assessmentCriteria: items }))
            }
            placeholder={pe.goals.criteriaPh}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>{pe.goals.langTitle}</CardTitle>
            <CardDescription>{pe.goals.langDesc}</CardDescription>
          </div>
          <div className="flex flex-col gap-1 items-end">
            <AiEnhanceButton
              section="languageObjectivesTerms"
              current={content.languageObjectives.terms}
              onApply={(terms) =>
                setContent((prev) => ({ ...prev,                   languageObjectives: { ...content.languageObjectives, terms },
                }))
              }
              context={{ topic: content.topic, subject: subjectName, grade, language }}
              label={pe.goals.aiTerms}
            />
            <AiEnhanceButton
              section="languageObjectivesPhrases"
              current={content.languageObjectives.phrases}
              onApply={(phrases) =>
                setContent((prev) => ({ ...prev,                   languageObjectives: { ...content.languageObjectives, phrases },
                }))
              }
              context={{ topic: content.topic, subject: subjectName, grade, language }}
              label={pe.goals.aiPhrases}
            />
            <GlossaryButton
              terms={content.languageObjectives.terms}
              context={{ topic: content.topic, subject: subjectName, grade, language }}
              onAddTerms={(ruTerms) =>
                setContent((prev) => ({ ...prev,                   languageObjectives: {
                    ...content.languageObjectives,
                    terms: [...content.languageObjectives.terms, ...ruTerms],
                  },
                }))
              }
            />
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>{pe.goals.terms}</Label>
            <ListEditor
              items={content.languageObjectives.terms}
              onChange={(terms) =>
                setContent((prev) => ({ ...prev,                   languageObjectives: {
                    ...content.languageObjectives,
                    terms,
                  },
                }))
              }
              placeholder={pe.goals.termsPh}
            />
          </div>
          <div>
            <Label>{pe.goals.phrases}</Label>
            <ListEditor
              items={content.languageObjectives.phrases}
              onChange={(phrases) =>
                setContent((prev) => ({ ...prev,                   languageObjectives: {
                    ...content.languageObjectives,
                    phrases,
                  },
                }))
              }
              placeholder={pe.goals.phrasesPh}
            />
          </div>
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="context" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{pe.context.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="values">{pe.context.values}</Label>
              <AiEnhanceButton
                section="values"
                current={content.values}
                onApply={(improved) => setContent((prev) => ({ ...prev, values: improved }))}
                context={{ topic: content.topic, subject: subjectName, grade, language }}
                label="AI"
              />
            </div>
            <Textarea
              id="values"
              rows={3}
              value={content.values}
              onChange={(e) =>
                setContent((prev) => ({ ...prev, values: e.target.value }))
              }
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="crossCurricularLinks">{pe.context.links}</Label>
              <AiEnhanceButton
                section="crossCurricularLinks"
                current={content.crossCurricularLinks}
                onApply={(improved) =>
                  setContent((prev) => ({ ...prev, crossCurricularLinks: improved }))
                }
                context={{ topic: content.topic, subject: subjectName, grade, language }}
                label="AI"
              />
            </div>
            <Textarea
              id="crossCurricularLinks"
              rows={3}
              value={content.crossCurricularLinks}
              onChange={(e) =>
                setContent((prev) => ({ ...prev, crossCurricularLinks: e.target.value }))
              }
            />
          </div>
          <div className="md:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="priorKnowledge">{pe.context.prior}</Label>
              <AiEnhanceButton
                section="priorKnowledge"
                current={content.priorKnowledge}
                onApply={(improved) =>
                  setContent((prev) => ({ ...prev, priorKnowledge: improved }))
                }
                context={{ topic: content.topic, subject: subjectName, grade, language }}
                label="AI"
              />
            </div>
            <Textarea
              id="priorKnowledge"
              rows={2}
              value={content.priorKnowledge}
              onChange={(e) =>
                setContent((prev) => ({ ...prev, priorKnowledge: e.target.value }))
              }
            />
          </div>
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="flow" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{pe.flow.title}</CardTitle>
          <CardDescription>
            {pe.flow.desc}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <StageEditor
            title={pe.flow.beginning}
            stageKey="beginning"
            stage={content.stages.beginning}
            onChange={(stage) =>
              setContent((prev) => ({ ...prev,                 stages: { ...content.stages, beginning: stage },
              }))
            }
            context={{ topic: content.topic, grade, subject: subjectName, language }}
            availableObjectives={content.learningObjectives}
          />
          <StageEditor
            title={pe.flow.middle}
            stageKey="middle"
            stage={content.stages.middle}
            onChange={(stage) =>
              setContent((prev) => ({ ...prev,                 stages: { ...content.stages, middle: stage },
              }))
            }
            context={{ topic: content.topic, grade, subject: subjectName, language }}
            availableObjectives={content.learningObjectives}
          />
          <StageEditor
            title={pe.flow.end}
            stageKey="end"
            stage={content.stages.end}
            onChange={(stage) =>
              setContent((prev) => ({ ...prev,                 stages: { ...content.stages, end: stage },
              }))
            }
            context={{ topic: content.topic, grade, subject: subjectName, language }}
            availableObjectives={content.learningObjectives}
          />
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="evaluation" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{pe.evaluation.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between">
              <Label>{pe.evaluation.formative}</Label>
              <AiEnhanceButton
                section="formativeAssessment"
                current={content.evaluation.formativeAssessment}
                onApply={(improved) =>
                  setContent((prev) => ({ ...prev,                     evaluation: { ...content.evaluation, formativeAssessment: improved },
                  }))
                }
                context={{ topic: content.topic, subject: subjectName, grade, language }}
                label="AI"
              />
            </div>
            <Textarea
              rows={3}
              value={content.evaluation.formativeAssessment}
              onChange={(e) =>
                setContent((prev) => ({ ...prev,                   evaluation: {
                    ...content.evaluation,
                    formativeAssessment: e.target.value,
                  },
                }))
              }
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>{pe.evaluation.differentiation}</Label>
              <AiEnhanceButton
                section="differentiation"
                current={content.evaluation.differentiation}
                onApply={(improved) =>
                  setContent((prev) => ({ ...prev,                     evaluation: { ...content.evaluation, differentiation: improved },
                  }))
                }
                context={{ topic: content.topic, subject: subjectName, grade, language }}
                label="AI"
              />
            </div>
            <Textarea
              rows={3}
              value={content.evaluation.differentiation}
              onChange={(e) =>
                setContent((prev) => ({ ...prev,                   evaluation: {
                    ...content.evaluation,
                    differentiation: e.target.value,
                  },
                }))
              }
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>{pe.evaluation.health}</Label>
              <AiEnhanceButton
                section="healthAndSafety"
                current={content.evaluation.healthAndSafety}
                onApply={(improved) =>
                  setContent((prev) => ({ ...prev,                     evaluation: { ...content.evaluation, healthAndSafety: improved },
                  }))
                }
                context={{ topic: content.topic, subject: subjectName, grade, language }}
                label="AI"
              />
            </div>
            <Textarea
              rows={2}
              value={content.evaluation.healthAndSafety}
              onChange={(e) =>
                setContent((prev) => ({ ...prev,                   evaluation: {
                    ...content.evaluation,
                    healthAndSafety: e.target.value,
                  },
                }))
              }
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>{pe.evaluation.reflection}</Label>
              <AiEnhanceButton
                section="reflection"
                current={content.evaluation.reflection}
                onApply={(improved) =>
                  setContent((prev) => ({ ...prev,                     evaluation: { ...content.evaluation, reflection: improved },
                  }))
                }
                context={{ topic: content.topic, subject: subjectName, grade, language }}
                label="AI"
              />
            </div>
            <Textarea
              rows={3}
              value={content.evaluation.reflection}
              onChange={(e) =>
                setContent((prev) => ({ ...prev,                   evaluation: {
                    ...content.evaluation,
                    reflection: e.target.value,
                  },
                }))
              }
            />
          </div>
        </CardContent>
      </Card>

        </TabsContent>
      </Tabs>

        {saveError && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600" />
            <div className="text-sm text-red-700">
              <p className="font-medium">{saveError}</p>
              {saveErrorHint && (
                <p className="mt-1 flex items-start gap-1 text-xs text-red-600">
                  <Lightbulb className="mt-0.5 size-3 shrink-0" />
                  <span>{pe.errors[`hint${saveErrorHint}` as "hintMetaProfile" | "hintGoalsTopic" | "hintMetaTitle"]}</span>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Auto-save indicator */}
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground" aria-live="polite">
          {draftStatus === "saving" && (
            <span className="flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              {pe.save.saving}
            </span>
          )}
          {draftStatus === "saved" && (
            <span className="flex items-center gap-1 text-[#2f5b4f]">
              <Check className="size-3" />
              {pe.save.allSaved}
            </span>
          )}
          {draftStatus === "idle" && draftSaved && (
            <span className="flex items-center gap-1 text-[#2f5b4f]">
              <Check className="size-3" />
              {pe.save.draftLocal}
            </span>
          )}
        </div>

        <div className="sticky bottom-3 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-border bg-surface p-3 shadow-card">
          {draftStatus === "saved" && <span className="mr-auto text-xs text-[#2f5b4f]">{pe.save.draftServer}</span>}
          {draftStatus === "saving" && <span className="mr-auto text-xs text-muted-foreground">{pe.save.savingDraft}</span>}
          {draftStatus === "error" && <span className="mr-auto text-xs text-red-600">{pe.save.draftFailedShort}</span>}
          {aiApplied && (
            <Button variant="outline" onClick={undoAiGenerate} type="button" title={pe.save.undoAiTitle}>
              <Undo2 />
              {pe.save.undoAi}
            </Button>
          )}
          <Button variant="outline" onClick={() => router.back()} type="button">
            {pe.save.cancel}
          </Button>
          <Button variant="outline" onClick={() => void saveDraft()} disabled={isPending || draftStatus === "saving"} type="button">
            {pe.save.saveDraft}
          </Button>
          <Button onClick={save} disabled={isPending || draftStatus === "saving"} type="button" title={pe.save.saveTitle}>
            {isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Сохранить
          </Button>
        </div>

        {pendingAi && (
          // Escape и клик по фону равносильны «Отклонить» — изменения не применяются молча.
          <Dialog open onOpenChange={(open) => { if (!open) setPendingAi(null); }}>
            <DialogContent
              className="max-w-2xl rounded-xl bg-surface p-5 shadow-2xl"
              overlayClassName="overflow-y-auto p-4"
              aria-label={pe.aiDialog.aria}
            >
              <DialogTitle className="text-lg font-bold">AI подготовил изменения ({pendingAi.diff.length})</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-slate-600">
                {pe.aiDialog.desc}
              </DialogDescription>
              <ul className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
                {pendingAi.diff.slice(0, 20).map((d) => (
                  <li key={d.label} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                    <p className="font-medium">
                      {d.label}{" "}
                      <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] ${d.filled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                        {d.filled ? pe.aiDialog.tagNew : pe.aiDialog.tagOverwrite}
                      </span>
                    </p>
                    <p className="mt-1 text-slate-600">{d.preview}</p>
                  </li>
                ))}
              </ul>
              {pendingAi.diff.length > 20 && (
                <p className="mt-2 text-xs text-slate-500">…и ещё {pendingAi.diff.length - 20}</p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPendingAi(null)} type="button">
                  {pe.aiDialog.reject}
                </Button>
                <Button onClick={applyPendingAi} type="button">
                  <Check /> Применить ({pendingAi.diff.length})
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* AI Loading Overlay */}
      {aiLoading && (
        <AiLoadingOverlay
          steps={aiSteps(t)}
          currentStep={aiStep}
          onCancel={cancelAi}
        />
      )}
    </div>
  );
}
