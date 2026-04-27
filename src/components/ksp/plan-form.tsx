"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Save, Loader2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  type LessonStage,
  emptyKsp,
  type SubjectRow,
} from "@/lib/types/ksp";
import type { InteractiveTask } from "@/lib/ksp/tasks";
import { TaskBuilder } from "./task-builder";
import { ObjectivesPicker } from "./objectives-picker";
import { AiEnhanceButton } from "./ai-enhance-button";
import { ListEditor } from "./list-editor";
import { RichTextEditor, richTextToPlain } from "./rich-text-editor";
import { uploadPlanImage } from "@/lib/upload-image";
import {
  savePlanAction,
  type SavePlanInput,
} from "@/app/actions/plans";

const DRAFT_KEY_PREFIX = "ksp-draft:";

interface PlanFormProps {
  initialPlan?: Partial<SavePlanInput> & { id?: string };
  subjects: SubjectRow[];
}

export function PlanForm({ initialPlan, subjects }: PlanFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [title, setTitle] = useState(initialPlan?.title ?? "");
  const [subjectId, setSubjectId] = useState(
    initialPlan?.subject_id ?? subjects[0]?.id ?? "",
  );
  const [grade, setGrade] = useState<number>(initialPlan?.grade ?? 5);
  const [quarter, setQuarter] = useState<number | null>(
    initialPlan?.quarter ?? null,
  );
  const [section, setSection] = useState(initialPlan?.section ?? "");
  const [visibility, setVisibility] = useState<
    "private" | "unlisted" | "public"
  >(initialPlan?.visibility ?? "private");
  const [language, setLanguage] = useState<"ru" | "kz">(
    initialPlan?.language ?? "ru",
  );
  const [content, setContent] = useState<KspContent>(
    initialPlan?.content ?? emptyKsp(),
  );
  const [activeTab, setActiveTab] = useState<string>("meta");
  const [draftSaved, setDraftSaved] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const subjectName =
    subjects.find((s) => s.id === subjectId)?.name_ru ?? "Предмет";

  const draftKey = `${DRAFT_KEY_PREFIX}${initialPlan?.id ?? "new"}`;

  // Restore draft on first mount (only when no initialPlan.content was supplied).
  useEffect(() => {
    if (initialPlan?.content) return;
    if (typeof window === "undefined") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = window.localStorage.getItem(draftKey);
        if (!raw) return;
        const saved = JSON.parse(raw) as {
          title?: string;
          subjectId?: string;
          grade?: number;
          quarter?: number | null;
          section?: string;
          visibility?: "private" | "unlisted" | "public";
          language?: "ru" | "kz";
          content?: KspContent;
        };
        if (saved.title !== undefined) setTitle(saved.title);
        if (saved.subjectId !== undefined && saved.subjectId) setSubjectId(saved.subjectId);
        if (saved.grade !== undefined) setGrade(saved.grade);
        if (saved.quarter !== undefined) setQuarter(saved.quarter);
        if (saved.section !== undefined) setSection(saved.section);
        if (saved.visibility !== undefined) setVisibility(saved.visibility);
        if (saved.language !== undefined) setLanguage(saved.language);
        if (saved.content) setContent(saved.content);
      } catch {
        // ignore corrupted draft
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave of the whole form state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = setTimeout(() => {
      try {
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({ title, subjectId, grade, quarter, section, visibility, language, content }),
        );
        setDraftSaved(true);
        const t = setTimeout(() => setDraftSaved(false), 1500);
        return () => clearTimeout(t);
      } catch {
        // ignore quota errors
      }
    }, 600);
    return () => clearTimeout(h);
  }, [title, subjectId, grade, quarter, section, visibility, language, content, draftKey]);

  const progress = useMemo(() => computeProgress(content, title), [content, title]);

  async function generateWithAi() {
    setAiError(null);
    if (!content.topic.trim()) {
      setAiError("Укажите тему урока для AI-генерации");
      return;
    }
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade,
          subject: subjectName,
          topic: content.topic,
          learningObjectives: content.learningObjectives.map((o) => o.text),
          language,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Ошибка AI");
      }
      const data = (await res.json()) as {
        content: Omit<KspContent, "header" | "learningObjectives">;
      };
      setContent((prev) => ({
        ...prev,
        topic: data.content.topic || prev.topic,
        lessonObjectives: data.content.lessonObjectives,
        assessmentCriteria: data.content.assessmentCriteria,
        languageObjectives: data.content.languageObjectives,
        values: data.content.values,
        crossCurricularLinks: data.content.crossCurricularLinks,
        priorKnowledge: data.content.priorKnowledge,
        stages: data.content.stages,
        evaluation: data.content.evaluation,
      }));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Не удалось сгенерировать");
    } finally {
      setAiLoading(false);
    }
  }

  const warnings = useMemo(
    () => collectWarnings({ title, topic: content.topic, content }),
    [title, content],
  );

  function save() {
    setSaveError(null);
    setShowValidation(true);
    const payload: SavePlanInput = {
      id: initialPlan?.id,
      title: title || content.topic || "Новый КСП",
      subject_id: subjectId || null,
      grade: Number(grade),
      quarter,
      section: section || null,
      visibility,
      language,
      content,
    };
    startTransition(async () => {
      const res = await savePlanAction(payload);
      if ("error" in res && res.error) {
        setSaveError(res.error);
      } else if ("id" in res && res.id) {
        try {
          window.localStorage.removeItem(draftKey);
        } catch {
          // ignore
        }
        router.push(`/plans/${res.id}`);
      }
    });
  }

  return (
    <div className="space-y-6">
      {showValidation && warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex gap-3 items-start">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-medium mb-1">
              План сохранён, но есть незаполненные важные разделы ({warnings.length}):
            </p>
            <ul className="list-disc pl-5 space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-3 sticky top-0 z-10 backdrop-blur">
        <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
          <span>Заполнено: {progress.percent}% ({progress.done}/{progress.total})</span>
          <span className="flex items-center gap-1 text-emerald-600">
            {draftSaved && (
              <>
                <Check className="w-3 h-3" /> Черновик сохранён
              </>
            )}
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-sky-400 to-emerald-500 transition-all duration-500"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap mobile-scroll w-full justify-start">
          <TabsTrigger value="meta">Метаданные</TabsTrigger>
          <TabsTrigger value="goals">Цели</TabsTrigger>
          <TabsTrigger value="context">Контекст</TabsTrigger>
          <TabsTrigger value="flow">Ход урока</TabsTrigger>
          <TabsTrigger value="evaluation">Оценивание</TabsTrigger>
        </TabsList>

        <TabsContent value="meta" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Метаданные</CardTitle>
          <CardDescription>
            Эти поля используются для каталогизации плана.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <Label htmlFor="title">
              Название КСП <span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Напр. «Натуральные числа. Сложение» — 5 класс"
              className={showValidation && !title.trim() ? "border-red-400 focus-visible:ring-red-400" : ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Предмет</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите предмет" />
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
              <Label htmlFor="grade">Класс</Label>
              <Input
                id="grade"
                type="number"
                min={1}
                max={12}
                value={grade}
                onChange={(e) => setGrade(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quarter">Четверть</Label>
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
              <Label>Язык</Label>
              <Select
                value={language}
                onValueChange={(v) => setLanguage(v as "ru" | "kz")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ru">Русский</SelectItem>
                  <SelectItem value="kz">Қазақша</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="section">Раздел долгосрочного плана</Label>
            <Input
              id="section"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="Напр. «Натуральные числа»"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Видимость</Label>
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
                <SelectItem value="private">Приватный (только я)</SelectItem>
                <SelectItem value="unlisted">По ссылке</SelectItem>
                <SelectItem value="public">Публичный (в библиотеке)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="goals" className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Тема урока</CardTitle>
            <CardDescription>
              Короткая формулировка темы из учебной программы.
            </CardDescription>
          </div>
          <Button
            type="button"
            onClick={generateWithAi}
            disabled={aiLoading}
            className="shrink-0"
          >
            {aiLoading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Sparkles />
            )}
            AI-заполнение
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={content.topic}
            onChange={(e) =>
              setContent({ ...content, topic: e.target.value })
            }
            placeholder="Напр. «Сложение многозначных чисел»"
            className={showValidation && !content.topic.trim() ? "border-red-400 focus-visible:ring-red-400" : ""}
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
          <CardTitle>Цели обучения</CardTitle>
          <CardDescription>
            Цели из официальной учебной программы РК (ГОСО). Выберите из списка
            или впишите вручную.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ObjectivesPicker
            subjectId={subjectId}
            grade={grade}
            selectedCodes={content.learningObjectives
              .map((o) => o.code)
              .filter(Boolean)}
            onAdd={(rows) =>
              setContent({
                ...content,
                learningObjectives: [
                  ...content.learningObjectives,
                  ...rows.filter(
                    (r) =>
                      !content.learningObjectives.some((o) => o.code === r.code),
                  ),
                ],
              })
            }
          />
          <ListEditor
            items={content.learningObjectives.map(
              (o) => `${o.code}${o.code ? " — " : ""}${o.text}`,
            )}
            onChange={(items) =>
              setContent({
                ...content,
                learningObjectives: items.map((raw) => {
                  const m = raw.match(/^([\d.]+)\s*[-—]\s*(.+)$/);
                  return m
                    ? { code: m[1], text: m[2] }
                    : { code: "", text: raw };
                }),
              })
            }
            placeholder="Напр. 5.1.2.1 — Выполнять сложение натуральных чисел"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle>Цели урока (SMART)</CardTitle>
          <AiEnhanceButton
            section="lessonObjectives"
            current={content.lessonObjectives}
            onApply={(improved) =>
              setContent({ ...content, lessonObjectives: improved })
            }
            context={{ topic: content.topic, subject: subjectName, grade, language }}
          />
        </CardHeader>
        <CardContent>
          <ListEditor
            items={content.lessonObjectives}
            onChange={(items) =>
              setContent({ ...content, lessonObjectives: items })
            }
            placeholder="Учащиеся смогут …"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle>Критерии оценивания</CardTitle>
          <AiEnhanceButton
            section="assessmentCriteria"
            current={content.assessmentCriteria}
            onApply={(improved) =>
              setContent({ ...content, assessmentCriteria: improved })
            }
            context={{ topic: content.topic, subject: subjectName, grade, language }}
          />
        </CardHeader>
        <CardContent>
          <ListEditor
            items={content.assessmentCriteria}
            onChange={(items) =>
              setContent({ ...content, assessmentCriteria: items })
            }
            placeholder="Напр. Решает задачу по алгоритму"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Языковые цели</CardTitle>
            <CardDescription>Термины и ключевые фразы</CardDescription>
          </div>
          <div className="flex flex-col gap-1 items-end">
            <AiEnhanceButton
              section="languageObjectivesTerms"
              current={content.languageObjectives.terms}
              onApply={(terms) =>
                setContent({
                  ...content,
                  languageObjectives: { ...content.languageObjectives, terms },
                })
              }
              context={{ topic: content.topic, subject: subjectName, grade, language }}
              label="AI → термины"
            />
            <AiEnhanceButton
              section="languageObjectivesPhrases"
              current={content.languageObjectives.phrases}
              onApply={(phrases) =>
                setContent({
                  ...content,
                  languageObjectives: { ...content.languageObjectives, phrases },
                })
              }
              context={{ topic: content.topic, subject: subjectName, grade, language }}
              label="AI → фразы"
            />
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Термины</Label>
            <ListEditor
              items={content.languageObjectives.terms}
              onChange={(terms) =>
                setContent({
                  ...content,
                  languageObjectives: {
                    ...content.languageObjectives,
                    terms,
                  },
                })
              }
              placeholder="Напр. определение"
            />
          </div>
          <div>
            <Label>Ключевые фразы</Label>
            <ListEditor
              items={content.languageObjectives.phrases}
              onChange={(phrases) =>
                setContent({
                  ...content,
                  languageObjectives: {
                    ...content.languageObjectives,
                    phrases,
                  },
                })
              }
              placeholder="Я считаю, что …"
            />
          </div>
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="context" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Контекст урока</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="values">Привитие ценностей</Label>
              <AiEnhanceButton
                section="values"
                current={content.values}
                onApply={(improved) => setContent({ ...content, values: improved })}
                context={{ topic: content.topic, subject: subjectName, grade, language }}
                label="AI"
              />
            </div>
            <Textarea
              id="values"
              rows={3}
              value={content.values}
              onChange={(e) =>
                setContent({ ...content, values: e.target.value })
              }
            />
          </div>
          <div>
            <Label htmlFor="crossCurricularLinks">Межпредметные связи</Label>
            <Textarea
              id="crossCurricularLinks"
              rows={3}
              value={content.crossCurricularLinks}
              onChange={(e) =>
                setContent({ ...content, crossCurricularLinks: e.target.value })
              }
            />
          </div>
          <div className="md:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="priorKnowledge">Предшествующие знания</Label>
              <AiEnhanceButton
                section="priorKnowledge"
                current={content.priorKnowledge}
                onApply={(improved) =>
                  setContent({ ...content, priorKnowledge: improved })
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
                setContent({ ...content, priorKnowledge: e.target.value })
              }
            />
          </div>
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="flow" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ход урока</CardTitle>
          <CardDescription>
            Запланируйте действия учителя и учеников по этапам.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <StageEditor
            title="Начало урока"
            stageKey="beginning"
            stage={content.stages.beginning}
            onChange={(stage) =>
              setContent({
                ...content,
                stages: { ...content.stages, beginning: stage },
              })
            }
            context={{ topic: content.topic, grade, subject: subjectName, language }}
            availableObjectives={content.learningObjectives}
          />
          <StageEditor
            title="Середина урока"
            stageKey="middle"
            stage={content.stages.middle}
            onChange={(stage) =>
              setContent({
                ...content,
                stages: { ...content.stages, middle: stage },
              })
            }
            context={{ topic: content.topic, grade, subject: subjectName, language }}
            availableObjectives={content.learningObjectives}
          />
          <StageEditor
            title="Конец урока"
            stageKey="end"
            stage={content.stages.end}
            onChange={(stage) =>
              setContent({
                ...content,
                stages: { ...content.stages, end: stage },
              })
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
          <CardTitle>Оценивание и рефлексия</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Формативное оценивание</Label>
            <Textarea
              rows={3}
              value={content.evaluation.formativeAssessment}
              onChange={(e) =>
                setContent({
                  ...content,
                  evaluation: {
                    ...content.evaluation,
                    formativeAssessment: e.target.value,
                  },
                })
              }
            />
          </div>
          <div>
            <Label>Дифференциация</Label>
            <Textarea
              rows={3}
              value={content.evaluation.differentiation}
              onChange={(e) =>
                setContent({
                  ...content,
                  evaluation: {
                    ...content.evaluation,
                    differentiation: e.target.value,
                  },
                })
              }
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Здоровье и ТБ</Label>
              <AiEnhanceButton
                section="healthAndSafety"
                current={content.evaluation.healthAndSafety}
                onApply={(improved) =>
                  setContent({
                    ...content,
                    evaluation: { ...content.evaluation, healthAndSafety: improved },
                  })
                }
                context={{ topic: content.topic, subject: subjectName, grade, language }}
                label="AI"
              />
            </div>
            <Textarea
              rows={2}
              value={content.evaluation.healthAndSafety}
              onChange={(e) =>
                setContent({
                  ...content,
                  evaluation: {
                    ...content.evaluation,
                    healthAndSafety: e.target.value,
                  },
                })
              }
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Рефлексия учителя</Label>
              <AiEnhanceButton
                section="reflection"
                current={content.evaluation.reflection}
                onApply={(improved) =>
                  setContent({
                    ...content,
                    evaluation: { ...content.evaluation, reflection: improved },
                  })
                }
                context={{ topic: content.topic, subject: subjectName, grade, language }}
                label="AI"
              />
            </div>
            <Textarea
              rows={3}
              value={content.evaluation.reflection}
              onChange={(e) =>
                setContent({
                  ...content,
                  evaluation: {
                    ...content.evaluation,
                    reflection: e.target.value,
                  },
                })
              }
            />
          </div>
        </CardContent>
      </Card>

        </TabsContent>
      </Tabs>

      {saveError && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">
          {saveError}
        </p>
      )}
      <div className="flex items-center justify-end gap-2 sticky bottom-4 bg-white/80 backdrop-blur border border-slate-200 rounded-lg p-3 shadow-sm">
        <Button variant="outline" onClick={() => router.back()} type="button">
          Отмена
        </Button>
        <Button onClick={save} disabled={isPending} type="button">
          {isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Сохранить
        </Button>
      </div>
    </div>
  );
}

function StageEditor({
  title,
  stageKey,
  stage,
  onChange,
  context,
  availableObjectives,
}: {
  title: string;
  stageKey: "beginning" | "middle" | "end";
  stage: LessonStage;
  onChange: (stage: LessonStage) => void;
  context: { topic: string; grade: number; subject: string; language: "ru" | "kz" };
  availableObjectives: Array<{ code: string; text: string }>;
}) {
  const tasks = stage.tasks ?? [];
  function setTasks(next: InteractiveTask[]) {
    onChange({ ...stage, tasks: next });
  }
  const timeHint =
    stageKey === "beginning"
      ? "1–10 мин"
      : stageKey === "middle"
        ? "11–35 мин"
        : "36–45 мин";
  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <Input
          className="w-40"
          value={stage.time}
          onChange={(e) => onChange({ ...stage, time: e.target.value })}
          placeholder={timeHint}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Действия учителя</Label>
          <RichTextEditor
            rows={4}
            value={stage.teacherActions}
            onChange={(html) =>
              onChange({ ...stage, teacherActions: html })
            }
            onUploadImage={uploadPlanImage}
            placeholder="Что делает учитель: объясняет, демонстрирует, направляет…"
          />
        </div>
        <div>
          <Label>Действия учеников</Label>
          <RichTextEditor
            rows={4}
            value={stage.studentActions}
            onChange={(html) =>
              onChange({ ...stage, studentActions: html })
            }
            onUploadImage={uploadPlanImage}
            placeholder="Что делают ученики: записывают, сравнивают, обсуждают…"
          />
        </div>
        <div className="md:col-span-2">
          <Label>Ресурсы</Label>
          <Input
            value={stage.resources}
            onChange={(e) => onChange({ ...stage, resources: e.target.value })}
            placeholder="Учебник, презентация, раздаточный материал"
          />
        </div>
        <div>
          <Label>
            Ключевые вопросы (кумулятивная беседа){" "}
            <span className="text-xs text-slate-500">— для активизации</span>
          </Label>
          <ListEditor
            items={stage.keyQuestions ?? []}
            onChange={(items) => onChange({ ...stage, keyQuestions: items })}
            placeholder={
              stageKey === "beginning"
                ? "Напр. «Что вы помните из предыдущего урока?»"
                : stageKey === "end"
                  ? "Напр. «Что нового вы узнали?»"
                  : "Напр. «Какое свойство вы заметили?»"
            }
          />
        </div>
        <div>
          <Label>
            Дескрипторы оценивания{" "}
            <span className="text-xs text-slate-500">
              — что именно делает ученик
            </span>
          </Label>
          <ListEditor
            items={stage.descriptors ?? []}
            onChange={(items) => onChange({ ...stage, descriptors: items })}
            placeholder="Напр. «Записывает определение»"
          />
        </div>
        <div className="md:col-span-2">
          <Label>Метод оценивания</Label>
          <Select
            value={stage.assessmentMethod ?? ""}
            onValueChange={(v) =>
              onChange({ ...stage, assessmentMethod: v === "_none" ? "" : v })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите метод" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— не указан —</SelectItem>
              <SelectItem value="Похвала">Похвала</SelectItem>
              <SelectItem value="ФО">ФО (формативное)</SelectItem>
              <SelectItem value="СОР">СОР (суммативное за раздел)</SelectItem>
              <SelectItem value="Взаимооценивание">Взаимооценивание</SelectItem>
              <SelectItem value="Самооценивание">Самооценивание</SelectItem>
              <SelectItem value="ФО + Взаимооценивание">
                ФО + Взаимооценивание
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {stageKey === "end" && (
          <>
            <div className="md:col-span-2">
              <Label>Итог урока</Label>
              <Textarea
                rows={2}
                value={stage.summary ?? ""}
                onChange={(e) => onChange({ ...stage, summary: e.target.value })}
                placeholder="1–2 предложения: что узнали, что закрепили"
              />
            </div>
            <div className="md:col-span-2">
              <Label>
                Рефлексивные вопросы ученикам{" "}
                <span className="text-xs text-slate-500">— 3 открытых</span>
              </Label>
              <ListEditor
                items={stage.reflectionQuestions ?? []}
                onChange={(items) =>
                  onChange({ ...stage, reflectionQuestions: items })
                }
                placeholder="Напр. «Что было сложно?»"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Домашнее задание</Label>
              <Textarea
                rows={2}
                value={stage.homework ?? ""}
                onChange={(e) =>
                  onChange({ ...stage, homework: e.target.value })
                }
                placeholder="Конкретное задание с комментарием"
              />
            </div>
          </>
        )}
      </div>
      <TaskBuilder
        tasks={tasks}
        onChange={setTasks}
        context={{ stage: stageKey, ...context }}
        availableObjectives={availableObjectives}
      />
    </div>
  );
}

function collectWarnings({
  title,
  topic,
  content,
}: {
  title: string;
  topic: string;
  content: KspContent;
}): string[] {
  const out: string[] = [];
  if (!title.trim()) out.push("Название КСП не заполнено");
  if (!topic.trim()) out.push("Тема урока не указана");
  if (content.learningObjectives.length === 0) out.push("Нет целей обучения из программы (ГОСО)");
  if (content.lessonObjectives.length === 0) out.push("Нет целей урока (SMART)");
  if (content.assessmentCriteria.length === 0)
    out.push("Не заданы критерии оценивания");
  const anyStage = (
    [content.stages.beginning, content.stages.middle, content.stages.end] as const
  ).some((s) => richTextToPlain(s.teacherActions).trim().length > 0);
  if (!anyStage)
    out.push("Нет действий учителя ни в одном этапе урока");
  const totalTasks =
    (content.stages.beginning.tasks?.length ?? 0) +
    (content.stages.middle.tasks?.length ?? 0) +
    (content.stages.end.tasks?.length ?? 0);
  if (totalTasks === 0)
    out.push(
      "Нет интерактивных заданий (добавьте хотя бы одно для вовлечения учеников)",
    );
  if (!content.evaluation.healthAndSafety.trim())
    out.push("Не заполнен раздел «Здоровье и ТБ»");
  return out;
}

function computeProgress(c: KspContent, title: string): { percent: number; done: number; total: number } {
  const checks: boolean[] = [
    title.trim().length > 0,
    c.topic.trim().length > 0,
    c.learningObjectives.length > 0,
    c.lessonObjectives.length > 0,
    c.assessmentCriteria.length > 0,
    c.languageObjectives.terms.length + c.languageObjectives.phrases.length > 0,
    c.values.trim().length > 0,
    c.priorKnowledge.trim().length > 0,
    richTextToPlain(c.stages.beginning.teacherActions).trim().length > 0,
    richTextToPlain(c.stages.middle.teacherActions).trim().length > 0,
    richTextToPlain(c.stages.end.teacherActions).trim().length > 0,
    c.evaluation.formativeAssessment.trim().length > 0,
    c.evaluation.reflection.trim().length > 0,
    c.evaluation.healthAndSafety.trim().length > 0,
    // Interactive tasks present anywhere
    (c.stages.beginning.tasks?.length ?? 0) +
      (c.stages.middle.tasks?.length ?? 0) +
      (c.stages.end.tasks?.length ?? 0) >
      0,
  ];
  const total = checks.length;
  const done = checks.filter(Boolean).length;
  return { percent: Math.round((done / total) * 100), done, total };
}
