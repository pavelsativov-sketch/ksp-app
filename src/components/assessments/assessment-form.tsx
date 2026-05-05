"use client";

/**
 * Assessment paper form — works for both create (no `initial`) and edit
 * (`initial.id` set). Wraps:
 *   - metadata block (title, kind=СОР/СОЧ, subject, grade, quarter, …)
 *   - AI-generation button that calls `/api/ai/generate-assessment` and
 *     fills the content state on success
 *   - lightweight editors for tasks / criteria / instructions (so the user
 *     can fix anything the AI got wrong before saving)
 *   - save / delete buttons
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  emptyAssessmentContent,
  type AssessmentContent,
  type AssessmentKind,
  type AssessmentPaperRow,
  type AssessmentTask,
  totalAssessmentPoints,
} from "@/lib/types/assessment";
import type { SubjectRow } from "@/lib/types/ksp";
import {
  deleteAssessmentAction,
  saveAssessmentAction,
} from "@/app/actions/assessments";

interface AssessmentFormProps {
  subjects: SubjectRow[];
  initial?: AssessmentPaperRow;
  defaults?: { teacherName?: string | null; school?: string | null };
  initialGrade?: number;
}

const TASK_TYPE_OPTIONS: { value: AssessmentTask["type"]; label: string }[] = [
  { value: "open", label: "Развёрнутый ответ" },
  { value: "test", label: "Тест" },
  { value: "match", label: "Соответствие" },
  { value: "fill", label: "Пропуски" },
  { value: "essay", label: "Эссе" },
];

export function AssessmentForm({
  subjects,
  initial,
  defaults,
  initialGrade,
}: AssessmentFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [kind, setKind] = useState<AssessmentKind>(initial?.kind ?? "sor");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [subjectId, setSubjectId] = useState<string | null>(
    initial?.subject_id ?? null,
  );
  const [grade, setGrade] = useState<number>(
    initial?.grade ?? initialGrade ?? 7,
  );
  const [quarter, setQuarter] = useState<number | null>(
    initial?.quarter ?? null,
  );
  const [section, setSection] = useState(initial?.section ?? "");
  const [duration, setDuration] = useState<number>(
    initial?.duration_minutes ?? initial?.content?.durationMinutes ?? 40,
  );
  const [language, setLanguage] = useState<"ru" | "kz">(
    initial?.language ?? "ru",
  );
  const [visibility, setVisibility] = useState<
    "private" | "unlisted" | "public"
  >(initial?.visibility ?? "private");

  const [content, setContent] = useState<AssessmentContent>(() => {
    if (initial?.content && initial.content.tasks?.length) {
      return initial.content;
    }
    const c = emptyAssessmentContent();
    c.header = {
      school: defaults?.school ?? "",
      teacherName: defaults?.teacherName ?? "",
      date: "",
      grade: String(initial?.grade ?? initialGrade ?? 7),
    };
    return c;
  });
  const [aiObjectivesText, setAiObjectivesText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const subjectName = useMemo(() => {
    return (
      subjects.find((s) => s.id === subjectId)?.name_ru ?? null
    );
  }, [subjects, subjectId]);

  const totalPoints = totalAssessmentPoints(content);

  function patchContent(patch: Partial<AssessmentContent>) {
    setContent((prev) => ({ ...prev, ...patch }));
  }

  function updateTask(idx: number, patch: Partial<AssessmentTask>) {
    setContent((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t, i) =>
        i === idx ? { ...t, ...patch } : t,
      ),
    }));
  }

  function addTask() {
    setContent((prev) => ({
      ...prev,
      tasks: [
        ...prev.tasks,
        {
          number: prev.tasks.length + 1,
          learningObjectiveCode: "",
          type: "open",
          text: "",
          answerKey: "",
          points: 1,
          descriptors: [],
        },
      ],
    }));
  }

  function removeTask(idx: number) {
    setContent((prev) => ({
      ...prev,
      tasks: prev.tasks
        .filter((_, i) => i !== idx)
        .map((t, i) => ({ ...t, number: i + 1 })),
    }));
  }

  async function generateWithAi() {
    setAiError(null);
    if (!subjectName) {
      setAiError("Сначала выберите предмет");
      return;
    }
    if (!section.trim() && !aiObjectivesText.trim()) {
      setAiError(
        "Укажите раздел или вставьте цели обучения — AI должен от чего-то отталкиваться",
      );
      return;
    }
    setAiLoading(true);
    try {
      const objectives = aiObjectivesText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const m = line.match(/^([\d.]+)[\s\-—:.]+(.+)$/);
          if (m) return { code: m[1], text: m[2].trim() };
          return { code: line.slice(0, 16), text: line };
        })
        .slice(0, 20);

      const res = await fetch("/api/ai/generate-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          grade,
          subject: subjectName,
          sections: section,
          quarter,
          durationMinutes: duration,
          learningObjectives: objectives,
          language,
        }),
      });
      const json = (await res.json()) as
        | { content: AssessmentContent }
        | { error: string };
      if (!res.ok || "error" in json) {
        throw new Error(("error" in json && json.error) || "AI error");
      }
      const generated = json.content;
      setContent((prev) => ({
        ...generated,
        // Keep what the teacher already typed in the header.
        header: {
          school: prev.header.school || generated.header.school,
          teacherName:
            prev.header.teacherName || generated.header.teacherName,
          date: prev.header.date || generated.header.date,
          grade: prev.header.grade || String(grade),
        },
      }));
      if (!title.trim()) {
        const kindLabel = kind === "sor" ? "СОР" : "СОЧ";
        setTitle(
          `${kindLabel} · ${subjectName} · ${grade} класс${
            section ? ` · ${section}` : ""
          }`,
        );
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI error");
    } finally {
      setAiLoading(false);
    }
  }

  function save() {
    setSaveError(null);
    if (!title.trim()) {
      setSaveError("Укажите название работы");
      return;
    }
    if (content.tasks.length === 0) {
      setSaveError(
        "Добавьте хотя бы одно задание (или сгенерируйте через AI)",
      );
      return;
    }
    startTransition(async () => {
      const res = await saveAssessmentAction({
        id: initial?.id,
        kind,
        title: title.trim(),
        subject_id: subjectId,
        grade,
        quarter,
        section: section.trim() || null,
        duration_minutes: duration,
        visibility,
        language,
        content,
      });
      if (res.error) {
        setSaveError(res.error);
        return;
      }
      if (res.id) router.push(`/assessments/${res.id}`);
    });
  }

  async function deletePaper() {
    if (!initial?.id) return;
    if (!confirm("Удалить работу безвозвратно?")) return;
    await deleteAssessmentAction(initial.id);
  }

  return (
    <div className="space-y-6">
      {/* ─── Metadata ─── */}
      <Card>
        <CardHeader>
          <CardTitle>Метаданные работы</CardTitle>
          <CardDescription>
            Тип, предмет, класс — нужно перед AI-генерацией.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <Field label="Название">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Напр.: СОР · Математика · 7 класс · Алгебра. Уравнения"
            />
          </Field>
          <Field label="Тип">
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as AssessmentKind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sor">СОР — за раздел</SelectItem>
                <SelectItem value="soch">СОЧ — за четверть</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Предмет">
            <Select
              value={subjectId ?? ""}
              onValueChange={(v) => setSubjectId(v || null)}
            >
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
          </Field>
          <Field label="Класс">
            <Input
              type="number"
              min={1}
              max={12}
              value={grade}
              onChange={(e) => setGrade(Number(e.target.value) || 7)}
            />
          </Field>
          <Field label="Четверть">
            <Select
              value={quarter ? String(quarter) : "_none"}
              onValueChange={(v) =>
                setQuarter(v === "_none" ? null : Number(v))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Не указана</SelectItem>
                <SelectItem value="1">1 четверть</SelectItem>
                <SelectItem value="2">2 четверть</SelectItem>
                <SelectItem value="3">3 четверть</SelectItem>
                <SelectItem value="4">4 четверть</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Длительность (минут)">
            <Input
              type="number"
              min={5}
              max={180}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 40)}
            />
          </Field>
          <Field
            label={kind === "sor" ? "Раздел" : "Разделы (через запятую)"}
            className="sm:col-span-2"
          >
            <Input
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder={
                kind === "sor"
                  ? "Напр.: Алгебра. Линейные уравнения"
                  : "Напр.: Алгебра. Уравнения; Геометрия. Треугольники"
              }
            />
          </Field>
          <Field label="Язык работы">
            <Select
              value={language}
              onValueChange={(v) => setLanguage(v as "ru" | "kz")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ru">Русский</SelectItem>
                <SelectItem value="kz">Қазақ</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Видимость">
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
                <SelectItem value="private">Приватная</SelectItem>
                <SelectItem value="unlisted">По ссылке</SelectItem>
                <SelectItem value="public">Публичная</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {/* ─── AI generation ─── */}
      <Card>
        <CardHeader>
          <CardTitle>AI-генерация заданий</CardTitle>
          <CardDescription>
            Вставьте 3–10 целей обучения по программе (по одной на строку, в
            формате <code>5.1.2.1 — текст цели</code>) и нажмите кнопку. AI
            составит работу, дескрипторы, ключи и шкалу перевода.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={aiObjectivesText}
            onChange={(e) => setAiObjectivesText(e.target.value)}
            placeholder="7.1.2.1 — решать линейные уравнения с одной переменной&#10;7.1.2.2 — приводить подобные слагаемые"
            rows={5}
          />
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              type="button"
              onClick={() => void generateWithAi()}
              disabled={aiLoading}
            >
              {aiLoading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Sparkles />
              )}
              Сгенерировать AI
            </Button>
            {aiError && (
              <p className="text-sm text-red-600 break-all">{aiError}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Tasks editor ─── */}
      <Card>
        <CardHeader>
          <CardTitle>Задания ({content.tasks.length})</CardTitle>
          <CardDescription>
            Сумма баллов: <strong>{totalPoints}</strong>. Можно править
            формулировки, баллы, дескрипторы и ключи перед сохранением.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {content.tasks.length === 0 && (
            <p className="text-sm text-slate-500">
              Пока нет заданий. Сгенерируйте AI или добавьте вручную.
            </p>
          )}
          {content.tasks.map((task, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 space-y-3"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold">
                  Задание {task.number}
                </span>
                <Select
                  value={task.type}
                  onValueChange={(v) =>
                    updateTask(idx, {
                      type: v as AssessmentTask["type"],
                    })
                  }
                >
                  <SelectTrigger className="w-44 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={task.learningObjectiveCode}
                  onChange={(e) =>
                    updateTask(idx, { learningObjectiveCode: e.target.value })
                  }
                  placeholder="Код ЦО"
                  className="w-32 h-8 text-xs font-mono"
                />
                <label className="text-xs text-slate-500 ml-auto">
                  Баллы
                </label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={task.points}
                  onChange={(e) =>
                    updateTask(idx, {
                      points: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-20 h-8"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeTask(idx)}
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </Button>
              </div>
              <Textarea
                value={task.text}
                onChange={(e) => updateTask(idx, { text: e.target.value })}
                placeholder="Формулировка задания"
                rows={3}
              />
              <Textarea
                value={task.answerKey}
                onChange={(e) =>
                  updateTask(idx, { answerKey: e.target.value })
                }
                placeholder="Ключ / эталонный ответ (виден только учителю)"
                rows={2}
                className="text-sm"
              />
              <Textarea
                value={task.descriptors.join("\n")}
                onChange={(e) =>
                  updateTask(idx, {
                    descriptors: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Дескрипторы оценивания (по одному на строку)"
                rows={2}
                className="text-sm"
              />
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addTask}>
            <Plus />
            Добавить задание
          </Button>
        </CardContent>
      </Card>

      {/* ─── Instructions ─── */}
      <Card>
        <CardHeader>
          <CardTitle>Инструкция для ученика</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={content.instructions}
            onChange={(e) => patchContent({ instructions: e.target.value })}
            placeholder="Например: на работу даётся 40 минут, отвечайте чёрной ручкой, чертежи разрешены."
            rows={3}
          />
        </CardContent>
      </Card>

      {/* ─── Save / delete ─── */}
      <div className="flex items-center gap-2 flex-wrap sticky bottom-0 bg-white/85 backdrop-blur border-t border-slate-200 -mx-4 px-4 py-3">
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {initial ? "Сохранить" : "Создать работу"}
        </Button>
        {initial && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void deletePaper()}
            className="text-red-700"
          >
            <Trash2 />
            Удалить
          </Button>
        )}
        {saveError && (
          <p className="text-sm text-red-600 break-all">{saveError}</p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}
