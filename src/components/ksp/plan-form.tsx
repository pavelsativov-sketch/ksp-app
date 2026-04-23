"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Save, Loader2, Plus, X } from "lucide-react";
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
import {
  type KspContent,
  type LessonStage,
  emptyKsp,
  type SubjectRow,
} from "@/lib/types/ksp";
import type { InteractiveTask } from "@/lib/ksp/tasks";
import { TaskBuilder } from "./task-builder";
import {
  savePlanAction,
  type SavePlanInput,
} from "@/app/actions/plans";

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

  const subjectName =
    subjects.find((s) => s.id === subjectId)?.name_ru ?? "Предмет";

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

  function save() {
    setSaveError(null);
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
        router.push(`/plans/${res.id}`);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Метаданные</CardTitle>
          <CardDescription>
            Эти поля используются для каталогизации плана.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <Label htmlFor="title">Название КСП</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Напр. «Натуральные числа. Сложение» — 5 класс"
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
            Цели из учебной программы РК (напр. код 5.1.2.1).
          </CardDescription>
        </CardHeader>
        <CardContent>
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
        <CardHeader>
          <CardTitle>Цели урока (SMART)</CardTitle>
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
        <CardHeader>
          <CardTitle>Критерии оценивания</CardTitle>
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
        <CardHeader>
          <CardTitle>Языковые цели</CardTitle>
          <CardDescription>Термины и ключевые фразы</CardDescription>
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

      <Card>
        <CardHeader>
          <CardTitle>Контекст урока</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="values">Привитие ценностей</Label>
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
            <Label htmlFor="priorKnowledge">Предшествующие знания</Label>
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
          />
        </CardContent>
      </Card>

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
            <Label>Здоровье и ТБ</Label>
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
            <Label>Рефлексия учителя</Label>
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

function ListEditor({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {items.map((item, idx) => (
          <li
            key={idx}
            className="flex items-start gap-2 bg-slate-50 rounded px-2 py-1"
          >
            <span className="text-slate-400 text-xs mt-1">•</span>
            <span className="flex-1 text-sm whitespace-pre-wrap">{item}</span>
            <button
              type="button"
              className="text-slate-400 hover:text-red-600"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              aria-label="Удалить"
            >
              <X className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              onChange([...items, draft.trim()]);
              setDraft("");
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (draft.trim()) {
              onChange([...items, draft.trim()]);
              setDraft("");
            }
          }}
        >
          <Plus /> Добавить
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
}: {
  title: string;
  stageKey: "beginning" | "middle" | "end";
  stage: LessonStage;
  onChange: (stage: LessonStage) => void;
  context: { topic: string; grade: number; subject: string; language: "ru" | "kz" };
}) {
  const tasks = stage.tasks ?? [];
  function setTasks(next: InteractiveTask[]) {
    onChange({ ...stage, tasks: next });
  }
  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <Input
          className="w-40"
          value={stage.time}
          onChange={(e) => onChange({ ...stage, time: e.target.value })}
          placeholder="0–5 мин"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Действия учителя</Label>
          <Textarea
            rows={4}
            value={stage.teacherActions}
            onChange={(e) =>
              onChange({ ...stage, teacherActions: e.target.value })
            }
          />
        </div>
        <div>
          <Label>Действия учеников</Label>
          <Textarea
            rows={4}
            value={stage.studentActions}
            onChange={(e) =>
              onChange({ ...stage, studentActions: e.target.value })
            }
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
      </div>
      <TaskBuilder
        tasks={tasks}
        onChange={setTasks}
        context={{ stage: stageKey, ...context }}
      />
    </div>
  );
}
