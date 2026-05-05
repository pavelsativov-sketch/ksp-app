"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Save,
  Loader2,
  Check,
  AlertTriangle,
  ListChecks,
} from "lucide-react";
import { postSse } from "@/lib/client/sse";
import { CritiqueDialog } from "./critique-dialog";
import { TranslateButton } from "./translate-button";
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
  emptyKsp,
  type SubjectRow,
  type LessonSeriesRow,
} from "@/lib/types/ksp";
import { ObjectivesPicker } from "./objectives-picker";
import { AiEnhanceButton } from "./ai-enhance-button";
import { ListEditor } from "./list-editor";
import {
  savePlanAction,
  createSeriesAction,
  type SavePlanInput,
} from "@/app/actions/plans";
import { StageEditor } from "./plan-form/stage-editor";
import { collectWarnings, computeProgress } from "./plan-form/helpers";
import {
  useDraftAutosave,
  useCloudAutosave,
} from "./plan-form/use-plan-autosave";

const DRAFT_KEY_PREFIX = "ksp-draft:";
const SERIES_NONE = "__none__";

interface PlanFormProps {
  initialPlan?: Partial<SavePlanInput> & { id?: string };
  subjects: SubjectRow[];
  seriesList?: LessonSeriesRow[];
  presetSeriesId?: string | null;
  presetSeriesPosition?: number | null;
  /**
   * Profile defaults — auto-filled into the lesson header on first edit if
   * the corresponding fields are still empty (so we don't overwrite a
   * user-supplied or restored draft value).
   */
  profileDefaults?: {
    teacherName?: string | null;
    school?: string | null;
  };
}

export function PlanForm({
  initialPlan,
  subjects,
  seriesList = [],
  presetSeriesId = null,
  presetSeriesPosition = null,
  profileDefaults,
}: PlanFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState<{ message: string; pct: number } | null>(
    null,
  );
  const [aiError, setAiError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [critiqueOpen, setCritiqueOpen] = useState(false);

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
  const [seriesId, setSeriesId] = useState<string | null>(
    initialPlan?.series_id ?? presetSeriesId ?? null,
  );
  const [seriesPosition, setSeriesPosition] = useState<number | null>(
    initialPlan?.series_position ?? presetSeriesPosition ?? null,
  );
  const [series, setSeries] = useState<LessonSeriesRow[]>(seriesList);
  const [creatingSeries, setCreatingSeries] = useState(false);
  const [newSeriesTitle, setNewSeriesTitle] = useState("");
  const [content, setContent] = useState<KspContent>(
    initialPlan?.content ?? emptyKsp(),
  );
  const [activeTab, setActiveTab] = useState<string>("meta");
  const [showValidation, setShowValidation] = useState(false);
  const userTouchedRef = useRef(false);

  const subjectName =
    subjects.find((s) => s.id === subjectId)?.name_ru ?? "Предмет";

  const draftKey = `${DRAFT_KEY_PREFIX}${initialPlan?.id ?? "new"}`;

  // Restore draft on first mount (only when no initialPlan.content was supplied).
  // After restoration, fill in any *still-empty* header fields from the saved
  // teacher profile (so a returning teacher with school/ФИО saved doesn't have
  // to retype them, but anything they typed previously wins).
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      let restored: KspContent | null = null;
      if (!initialPlan?.content) {
        try {
          const raw = window.localStorage.getItem(draftKey);
          if (raw) {
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
            if (saved.subjectId !== undefined && saved.subjectId)
              setSubjectId(saved.subjectId);
            if (saved.grade !== undefined) setGrade(saved.grade);
            if (saved.quarter !== undefined) setQuarter(saved.quarter);
            if (saved.section !== undefined) setSection(saved.section);
            if (saved.visibility !== undefined) setVisibility(saved.visibility);
            if (saved.language !== undefined) setLanguage(saved.language);
            if (saved.content) {
              restored = saved.content;
              setContent(saved.content);
            }
          }
        } catch {
          // ignore corrupted draft
        }
      }

      if (profileDefaults) {
        // Apply profile defaults only on top of empty header fields.
        const base = restored ?? initialPlan?.content ?? null;
        const teacherEmpty = !base?.header.teacherName?.trim();
        const schoolEmpty = !base?.header.school?.trim();
        if (
          (teacherEmpty && profileDefaults.teacherName) ||
          (schoolEmpty && profileDefaults.school)
        ) {
          setContent((prev) => ({
            ...prev,
            header: {
              ...prev.header,
              teacherName:
                !prev.header.teacherName?.trim() && profileDefaults.teacherName
                  ? profileDefaults.teacherName
                  : prev.header.teacherName,
              school:
                !prev.header.school?.trim() && profileDefaults.school
                  ? profileDefaults.school
                  : prev.header.school,
            },
          }));
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mark form as user-touched once any state setter fires after the initial
  // render. The initial mount restoration of localStorage/profileDefaults
  // shouldn't count as a user edit (so we don't autosave a freshly opened plan
  // without changes).
  useEffect(() => {
    const id = window.setTimeout(() => {
      userTouchedRef.current = true;
    }, 200);
    return () => window.clearTimeout(id);
  }, []);

  const draftSnapshot = useMemo(
    () => ({
      title,
      subjectId,
      grade,
      quarter,
      section,
      visibility,
      language,
      content,
    }),
    [title, subjectId, grade, quarter, section, visibility, language, content],
  );
  const { draftSaved } = useDraftAutosave({
    draftKey,
    snapshot: draftSnapshot,
  });

  const { cloudSaving, cloudSavedAt, cloudError } = useCloudAutosave({
    planId: initialPlan?.id,
    title,
    content,
    userTouchedRef,
  });

  const progress = useMemo(() => computeProgress(content, title), [content, title]);

  async function generateWithAi() {
    setAiError(null);
    setAiProgress(null);
    if (!content.topic.trim()) {
      setAiError("Укажите тему урока для AI-генерации");
      return;
    }
    setAiLoading(true);
    try {
      let received: Omit<KspContent, "header" | "learningObjectives"> | null =
        null;
      let streamError: string | null = null;
      await postSse("/api/ai/generate-stream", {
        body: {
          grade,
          subject: subjectName,
          topic: content.topic,
          learningObjectives: content.learningObjectives.map((o) => o.text),
          language,
        },
        onEvent: (e) => {
          if (e.event === "progress") {
            const d = e.data as { message?: string; pct?: number };
            setAiProgress({
              message: d.message ?? "",
              pct: typeof d.pct === "number" ? d.pct : 0,
            });
          } else if (e.event === "done") {
            const d = e.data as {
              content: Omit<KspContent, "header" | "learningObjectives">;
            };
            received = d.content;
          } else if (e.event === "error") {
            const d = e.data as { message?: string };
            streamError = d.message ?? "Ошибка AI";
          }
        },
      });
      if (streamError) throw new Error(streamError);
      if (!received) throw new Error("AI не вернул содержимое");
      const ai = received as Omit<KspContent, "header" | "learningObjectives">;
      setContent((prev) => ({
        ...prev,
        topic: ai.topic || prev.topic,
        lessonObjectives: ai.lessonObjectives,
        assessmentCriteria: ai.assessmentCriteria,
        // PR-11: also propagate pointsScale + overallRubric. Without these the
        // 10-point scale and the 1–10 rubric the AI generated were silently
        // discarded by the UI even though the schema accepted them.
        pointsScale: ai.pointsScale ?? prev.pointsScale,
        overallRubric: ai.overallRubric ?? prev.overallRubric,
        languageObjectives: ai.languageObjectives,
        values: ai.values,
        crossCurricularLinks: ai.crossCurricularLinks,
        priorKnowledge: ai.priorKnowledge,
        stages: ai.stages,
        evaluation: ai.evaluation,
      }));
      setAiProgress({ message: "Готово", pct: 100 });
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Не удалось сгенерировать");
    } finally {
      setAiLoading(false);
      // Hide the progress bar shortly after completion so it doesn't linger.
      window.setTimeout(() => setAiProgress(null), 1500);
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
      series_id: seriesId,
      series_position: seriesId ? seriesPosition : null,
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
          <span className="flex items-center gap-2">
            {cloudSaving && (
              <span className="text-slate-500 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Сохраняем в облако…
              </span>
            )}
            {!cloudSaving && cloudSavedAt && (
              <span className="text-emerald-600 flex items-center gap-1">
                <Check className="w-3 h-3" /> Сохранено в облаке (
                {new Date(cloudSavedAt).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                )
              </span>
            )}
            {!cloudSaving && !cloudSavedAt && draftSaved && (
              <span className="text-emerald-600 flex items-center gap-1">
                <Check className="w-3 h-3" /> Черновик сохранён
              </span>
            )}
            {cloudError && (
              <span className="text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {cloudError}
              </span>
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

      <Card>
        <CardHeader>
          <CardTitle>Серия уроков</CardTitle>
          <CardDescription>
            Объедините несколько КСП в последовательность (Урок 1 → Урок 2 → …),
            чтобы переключаться между ними с одной кнопки.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <Label>Серия</Label>
            <Select
              value={seriesId ?? SERIES_NONE}
              onValueChange={(v) => {
                if (v === SERIES_NONE) {
                  setSeriesId(null);
                  setSeriesPosition(null);
                } else {
                  setSeriesId(v);
                  if (seriesPosition == null) setSeriesPosition(1);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Не входит в серию" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SERIES_NONE}>Не входит в серию</SelectItem>
                {series.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                    {s.grade ? ` · ${s.grade} класс` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="series-position">Номер урока в серии</Label>
            <Input
              id="series-position"
              type="number"
              min={1}
              max={99}
              value={seriesPosition ?? ""}
              onChange={(e) =>
                setSeriesPosition(
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              disabled={!seriesId}
              placeholder={seriesId ? "1" : "—"}
            />
          </div>
          <div className="md:col-span-3 flex items-end gap-2 flex-wrap">
            {!creatingSeries ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setCreatingSeries(true)}
              >
                + Создать новую серию
              </Button>
            ) : (
              <div className="flex items-end gap-2 flex-wrap w-full md:w-auto">
                <div className="space-y-1 flex-1 min-w-[220px]">
                  <Label htmlFor="new-series-title" className="text-xs">
                    Название серии
                  </Label>
                  <Input
                    id="new-series-title"
                    value={newSeriesTitle}
                    onChange={(e) => setNewSeriesTitle(e.target.value)}
                    placeholder="Напр. «Десятичные дроби — 5 класс»"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={!newSeriesTitle.trim()}
                  onClick={async () => {
                    const res = await createSeriesAction({
                      title: newSeriesTitle.trim(),
                      subject: subjectName,
                      grade,
                      quarter,
                    });
                    if (res.id) {
                      const newRow: LessonSeriesRow = {
                        id: res.id,
                        user_id: "",
                        title: newSeriesTitle.trim(),
                        subject: subjectName,
                        grade,
                        quarter,
                        created_at: new Date().toISOString(),
                      };
                      setSeries((prev) => [newRow, ...prev]);
                      setSeriesId(res.id);
                      setSeriesPosition(1);
                      setNewSeriesTitle("");
                      setCreatingSeries(false);
                    }
                  }}
                >
                  Создать
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCreatingSeries(false);
                    setNewSeriesTitle("");
                  }}
                >
                  Отмена
                </Button>
              </div>
            )}
            {seriesId && seriesPosition && (
              <span className="text-xs text-slate-500 ml-auto">
                Этот план — Урок {seriesPosition} в серии «
                {series.find((s) => s.id === seriesId)?.title ?? "—"}»
              </span>
            )}
          </div>
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="goals" className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Тема урока</CardTitle>
            <CardDescription>
              Короткая формулировка темы из учебной программы.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCritiqueOpen(true)}
              disabled={aiLoading || !content.topic.trim()}
              title="AI-проверка плана на соответствие стандартам"
            >
              <ListChecks />
              Проверить план
            </Button>
            <TranslateButton
              content={content}
              currentLanguage={language}
              disabled={aiLoading}
              onTranslated={(translated, target) => {
                setContent(translated);
                setLanguage(target);
              }}
            />
            <Button
              type="button"
              onClick={generateWithAi}
              disabled={aiLoading}
            >
              {aiLoading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Sparkles />
              )}
              AI-заполнение
            </Button>
          </div>
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
          {aiProgress && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                <span className="truncate">{aiProgress.message}</span>
                <span className="ml-auto tabular-nums text-xs text-slate-500">
                  {aiProgress.pct}%
                </span>
              </div>
              <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${aiProgress.pct}%` }}
                />
              </div>
            </div>
          )}
          {aiError && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
              {aiError}
            </p>
          )}
        </CardContent>
      </Card>
      <CritiqueDialog
        open={critiqueOpen}
        onOpenChange={setCritiqueOpen}
        content={content}
        language={language}
      />

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

