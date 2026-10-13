"use client";

import { useState } from "react";
import { Plus, Trash2, Wand2, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  emptyTask,
  taskTypeLabel,
  type InteractiveTask,
  type TaskType,
  type McqTask,
  type TrueFalseTask,
  type ShortAnswerTask,
  type FillBlankTask,
  type MatchingTask,
  type OrderingTask,
  type NumericTask,
} from "@/lib/ksp/tasks";
import { TaskPlayer } from "./task-player";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import { PlanBlockPicker, blockProvenance, type PlanReuseBlock } from "./plan-block-picker";

const TYPES: TaskType[] = [
  "MCQ",
  "TRUE_FALSE",
  "SHORT_ANSWER",
  "FILL_BLANK",
  "MATCHING",
  "ORDERING",
  "NUMERIC",
];

export interface TaskBuilderProps {
  tasks: InteractiveTask[];
  onChange: (tasks: InteractiveTask[]) => void;
  context: {
    stage: "beginning" | "middle" | "end";
    topic: string;
    grade: number;
    subject: string;
    language: "ru" | "kz";
  };
  availableObjectives?: Array<{ code: string; text: string }>;
  availableCriteria?: string[];
}

type TaskVariationStyle = "alternate" | "simpler" | "harder" | "pair" | "shorter";
type TaskGenerationContext = TaskBuilderProps["context"];
const VARIATION_LABELS: Record<TaskVariationStyle, { ru: string; kk: string }> = {
  alternate: { ru: "Другой контекст", kk: "Басқа контекст" },
  simpler: { ru: "Проще", kk: "Жеңілірек" },
  harder: { ru: "Сложнее", kk: "Күрделірек" },
  pair: { ru: "Для пары", kk: "Жұптық жұмыс" },
  shorter: { ru: "Короче", kk: "Қысқарақ" },
};

async function requestTaskVariants(context: TaskGenerationContext, baseTask?: InteractiveTask, variationStyle?: TaskVariationStyle) {
  const cleanBaseTask = baseTask ? { ...baseTask } : undefined;
  if (cleanBaseTask) {
    delete cleanBaseTask.aiGenerated;
    delete cleanBaseTask.aiReviewed;
  }
  const response = await fetch("/api/ai/generate-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...context, count: 3, ...(cleanBaseTask ? { baseTask: cleanBaseTask } : {}), ...(variationStyle ? { variationStyle } : {}) }),
  });
  const data = await response.json().catch(() => ({})) as { tasks?: InteractiveTask[]; error?: string };
  if (!response.ok) throw new Error(data.error || "Не удалось подготовить варианты задания.");
  if (!Array.isArray(data.tasks) || data.tasks.length < 2 || data.tasks.length > 3) {
    throw new Error("Сервис вернул меньше двух корректных вариантов. Повторите попытку.");
  }
  return data.tasks.map((task) => ({ ...task, aiGenerated: true, aiReviewed: false }));
}

export function TaskBuilder({ tasks, onChange, context, availableObjectives = [], availableCriteria = [] }: TaskBuilderProps) {
  const [newType, setNewType] = useState<TaskType>("MCQ");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<InteractiveTask[]>([]);
  const { locale } = useUiLocale();
  const isKk = locale === "kk";

  function addTask() {
    onChange([...tasks, emptyTask(newType)]);
  }

  function updateTask(idx: number, task: InteractiveTask) {
    onChange(tasks.map((t, i) => (i === idx ? (task.aiGenerated ? { ...task, aiReviewed: false } : task) : t)));
  }

  function updateReview(idx: number, reviewed: boolean) {
    onChange(tasks.map((task, i) => (i === idx && task.aiGenerated ? { ...task, aiReviewed: reviewed } : task)));
  }

  function removeTask(idx: number) {
    onChange(tasks.filter((_, i) => i !== idx));
  }

  async function generateTasks() {
    setAiError(null);
    if (!context.topic.trim()) {
      setAiError(isKk ? "Сабақ тақырыбын көрсетіңіз." : "Укажите тему урока.");
      return;
    }
    setAiLoading(true);
    try {
      setAlternatives(await requestTaskVariants(context));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : isKk ? "Нұсқаларды жасау мүмкін болмады." : "Не удалось подготовить варианты.");
    } finally {
      setAiLoading(false);
    }
  }

  function acceptAlternative(index: number) {
    const selected = alternatives[index];
    if (!selected) return;
    onChange([...tasks, selected]);
    setAlternatives([]);
    setAiError(null);
  }

  function reuseTask(block: PlanReuseBlock) {
    if (block.kind !== "task") return;
    const copy = JSON.parse(JSON.stringify(block.payload)) as InteractiveTask;
    onChange([...tasks, {
      ...copy,
      id: globalThis.crypto?.randomUUID?.() ?? `copy_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      copiedFrom: blockProvenance(block),
      ...(copy.aiGenerated ? { aiReviewed: false } : {}),
    }]);
  }

  return (
    <div className="space-y-4 border-t border-[#ddd5cb] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="editorial-kicker">
          {isKk ? "Интерактивті тапсырмалар" : "Интерактивные задания"} {tasks.length > 0 && `(${tasks.length})`}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PlanBlockPicker
            kind="task"
            target={{ grade: context.grade, language: context.language, objectiveCodes: availableObjectives.map((objective) => objective.code) }}
            onUse={reuseTask}
          />
          <Select
            value={newType}
            onValueChange={(v) => setNewType(v as TaskType)}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {taskTypeLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={addTask}>
            <Plus className="w-4 h-4" /> Добавить
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={generateTasks}
            disabled={aiLoading || alternatives.length > 0}
            aria-busy={aiLoading}
            title={isKk ? "AI арқылы 2–3 балама дайындау" : "Подготовить 2–3 альтернативы с AI"}
          >
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {isKk ? "AI нұсқалары" : "AI-варианты"}
          </Button>
        </div>
      </div>
      <p className="text-xs text-[#756b63]">
        {isKk ? "Ұсыныстар КСП-ға тек сіз таңдағаннан кейін қосылады." : "Предложения не меняют КСП, пока вы явно не добавите выбранный вариант."}
      </p>
      {aiError && (
        <p role="alert" className="rounded-xl border border-[#e8c8bf] bg-[#f7e6e1] p-3 text-xs text-[#a84023]">
          {aiError}
        </p>
      )}
      {alternatives.length > 0 && (
        <section aria-label={isKk ? "AI тапсырма нұсқалары" : "Предлагаемые AI варианты"} className="space-y-3 rounded-2xl border border-[#cfc3b5] bg-[#f8f4ed] p-4">
          <div>
            <h3 className="text-sm font-semibold text-[#302820]">{isKk ? "Таңдау үшін ұсыныстар" : "Варианты для выбора"}</h3>
            <p className="mt-1 text-xs text-[#756b63]">{isKk ? "Әрқайсысын қарап шығыңыз. Таңдалған нұсқа ғана КСП-ға қосылады." : "Просмотрите варианты; в КСП попадёт только тот, который вы примете."}</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {alternatives.map((candidate, index) => (
              <TaskCandidate
                key={candidate.id}
                task={candidate}
                index={index}
                isKk={isKk}
                acceptLabel={isKk ? "Осы тапсырманы қосу" : "Добавить как новое задание"}
                onAccept={() => acceptAlternative(index)}
                onReject={() => setAlternatives((current) => current.filter((_, i) => i !== index))}
              />
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAlternatives([])}>
            {isKk ? "Барлық ұсыныстан бас тарту" : "Отклонить все предложения"}
          </Button>
        </section>
      )}
      {tasks.length === 0 && (
        <p className="text-xs text-[#8a817a] italic">
          {isKk ? "Әзірге тапсырма жоқ — қолмен қосыңыз немесе AI нұсқаларын қарап шығыңыз." : "Пока заданий нет — добавьте вручную или просмотрите AI-варианты."}
        </p>
      )}
      <div className="space-y-2">
        {tasks.map((task, idx) => (
          <TaskCard
            key={task.id}
            task={task}
            context={context}
            onChange={(t) => updateTask(idx, t)}
            onReviewChange={(reviewed) => updateReview(idx, reviewed)}
            onDelete={() => removeTask(idx)}
            availableObjectives={availableObjectives}
            availableCriteria={availableCriteria}
          />
        ))}
      </div>
    </div>
  );
}

function TaskCandidate({
  task,
  index,
  isKk,
  acceptLabel,
  onAccept,
  onReject,
}: {
  task: InteractiveTask;
  index: number;
  isKk: boolean;
  acceptLabel: string;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <article className="space-y-3 rounded-xl border border-[#ddd5cb] bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{isKk ? `Ұсыныс ${index + 1}` : `Вариант ${index + 1}`}</h4>
        <span className="text-xs text-[#756b63]">{taskTypeLabel(task.type)} · {task.points} {isKk ? "ұпай" : "балл"}</span>
      </div>
      <p className="text-sm text-[#302820]">{task.question}</p>
      <details>
        <summary className="cursor-pointer text-xs font-medium text-[#655b53]">{isKk ? "Оқушы көрінісін алдын ала қарау" : "Предпросмотр для ученика"}</summary>
        <div className="mt-2 rounded-lg bg-[#f8f4ed] p-3"><TaskPlayer task={task} /></div>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onAccept}>{acceptLabel}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onReject}>{isKk ? "Қабылдамау" : "Отклонить"}</Button>
      </div>
    </article>
  );
}

function TaskCard({
  task,
  onChange,
  onReviewChange,
  onDelete,
  context,
  availableObjectives,
  availableCriteria,
}: {
  task: InteractiveTask;
  onChange: (t: InteractiveTask) => void;
  onReviewChange: (reviewed: boolean) => void;
  onDelete: () => void;
  context: TaskGenerationContext;
  availableObjectives: Array<{ code: string; text: string }>;
  availableCriteria: string[];
}) {
  const [open, setOpen] = useState(true);
  const [preview, setPreview] = useState(false);
  const [variants, setVariants] = useState<InteractiveTask[]>([]);
  const [variantLoading, setVariantLoading] = useState(false);
  const [variantError, setVariantError] = useState<string | null>(null);
  const [variationStyle, setVariationStyle] = useState<TaskVariationStyle>("alternate");
  const { locale } = useUiLocale();
  const isKk = locale === "kk";

  async function generateAlternatives() {
    setVariantError(null);
    setVariantLoading(true);
    try {
      setVariants(await requestTaskVariants(context, task, variationStyle));
    } catch (error) {
      setVariantError(error instanceof Error ? error.message : isKk ? "Нұсқаларды жасау мүмкін болмады." : "Не удалось подготовить варианты.");
    } finally {
      setVariantLoading(false);
    }
  }

  function acceptVariant(variant: InteractiveTask) {
    onChange({
      ...variant,
      id: task.id,
      points: task.points,
      objectiveCode: task.objectiveCode,
      criterionTexts: task.criterionTexts,
      aiGenerated: true,
      aiReviewed: false,
    });
    setVariants([]);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#ddd5cb] bg-[#f1ece4]">
      <div className="flex items-center justify-between border-b border-[#ddd5cb] bg-[#f1ece4] px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-sm font-medium text-[#5f5751] hover:text-[#1c1a17]"
        >
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <span className="text-xs uppercase tracking-wider text-[#8a817a]">
            {taskTypeLabel(task.type)}
          </span>
          <span className="text-[#1c1a17]">
            {task.question || <em className="text-slate-400">без вопроса</em>}
          </span>
        </button>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <label className="sr-only" htmlFor={`variation-style-${task.id}`}>{isKk ? "Нұсқа бағыты" : "Направление варианта"}</label>
          <select
            id={`variation-style-${task.id}`}
            value={variationStyle}
            onChange={(event) => setVariationStyle(event.target.value as TaskVariationStyle)}
            className="max-w-32 rounded-lg border border-[#cfc3b5] bg-white px-2 py-1.5 text-xs"
          >
            {(Object.keys(VARIATION_LABELS) as TaskVariationStyle[]).map((style) => (
              <option key={style} value={style}>{VARIATION_LABELS[style][isKk ? "kk" : "ru"]}</option>
            ))}
          </select>
          <Button type="button" variant="outline" size="sm" onClick={generateAlternatives} disabled={variantLoading} aria-busy={variantLoading}>
            {variantLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {isKk ? "AI нұсқалары" : "AI-варианты"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPreview(!preview)}
          >
            {preview ? "Скрыть" : "Проба"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {task.aiGenerated && (
        <aside className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ddd5cb] bg-[#fff9e8] px-4 py-3 text-xs" aria-label={isKk ? "AI мазмұнының тексерілу күйі" : "Проверка AI-содержимого"}>
          <div>
            <p className="font-semibold text-[#594715]">{task.aiReviewed ? (isKk ? "Мұғалім тексерді" : "Учитель проверил") : (isKk ? "Мұғалім тексеруі қажет" : "Нужно проверить учителю")}</p>
            <p className="mt-0.5 text-[#756b63]">{isKk ? "Дереккөз тіркелмеген — қолмен тексеру бөлек белгіленеді." : "Источники не указаны; ручная проверка — отдельная отметка."}</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 font-medium text-[#45370f]">
            <input type="checkbox" checked={task.aiReviewed === true} onChange={(event) => onReviewChange(event.target.checked)} />
            {task.aiReviewed ? (isKk ? "Тексерілген деп белгіленді" : "Отмечено как проверенное") : (isKk ? "Мазмұнды тексердім" : "Я проверил(а) содержание")}
          </label>
        </aside>
      )}
      {task.copiedFrom && (
        <p className="border-b border-[#ddd5cb] bg-white px-4 py-2 text-xs text-[#756b63]">
          {isKk ? "Дереккөз жоспар" : "Скопировано из плана"} «{task.copiedFrom.sourcePlanTitle}» · {task.copiedFrom.sourceGrade} {isKk ? "сынып" : "класс"}
        </p>
      )}

      {variantError && <p role="alert" className="mx-3 mt-3 rounded-lg border border-[#e8c8bf] bg-[#f7e6e1] p-2 text-xs text-[#a84023]">{variantError}</p>}
      {variants.length > 0 && (
        <section className="space-y-3 border-b border-[#ddd5cb] bg-[#f8f4ed] p-3" aria-label={isKk ? "Тапсырма баламалары" : "Альтернативы текущего задания"}>
          <div>
            <h3 className="text-sm font-semibold">{isKk ? "Бастапқы тапсырманың баламалары" : "Варианты исходного задания"}</h3>
            <p className="mt-1 text-xs text-[#756b63]">{isKk ? "Бастапқы нұсқа өзгермейді. Таңдасаңыз ғана мәтін жаңарады; ұпайлар мен мақсаттар сақталады." : "Исходная задача не меняется до принятия; при замене баллы, цель и критерии сохраняются."}</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {variants.map((variant, index) => (
              <TaskCandidate
                key={variant.id}
                task={variant}
                index={index}
                isKk={isKk}
                acceptLabel={isKk ? "Осы нұсқамен ауыстыру" : "Заменить после проверки"}
                onAccept={() => acceptVariant(variant)}
                onReject={() => setVariants((current) => current.filter((_, i) => i !== index))}
              />
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setVariants([])}>{isKk ? "Бастапқы тапсырманы сақтау" : "Сохранить исходное задание"}</Button>
        </section>
      )}

      {open && (
        <div className="p-3 space-y-3">
          <CommonFields task={task} onChange={onChange} />
          {task.type === "MCQ" && <McqEditor task={task} onChange={onChange} />}
          {task.type === "TRUE_FALSE" && <TrueFalseEditor task={task} onChange={onChange} />}
          {task.type === "SHORT_ANSWER" && <ShortAnswerEditor task={task} onChange={onChange} />}
          {task.type === "FILL_BLANK" && <FillBlankEditor task={task} onChange={onChange} />}
          {task.type === "MATCHING" && <MatchingEditor task={task} onChange={onChange} />}
          {task.type === "ORDERING" && <OrderingEditor task={task} onChange={onChange} />}
          {task.type === "NUMERIC" && <NumericEditor task={task} onChange={onChange} />}
          <TaskOptions task={task} onChange={onChange} availableObjectives={availableObjectives} availableCriteria={availableCriteria} />
        </div>
      )}

      {preview && (
        <div className="border-t border-[#ddd5cb] bg-surface p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">
            Превью для ученика
          </p>
          <TaskPlayer task={task} />
        </div>
      )}
    </div>
  );
}

function CommonFields({
  task,
  onChange,
}: {
  task: InteractiveTask;
  onChange: (t: InteractiveTask) => void;
}) {
  const questionId = `task-question-${task.id}`;
  const pointsId = `task-points-${task.id}`;
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-3">
      <div>
        <Label htmlFor={questionId}>Вопрос / инструкция</Label>
        <Textarea
          id={questionId}
          rows={2}
          value={task.question}
          onChange={(e) => onChange({ ...task, question: e.target.value })}
          placeholder="Напр. «Какое из чисел является простым?»"
        />
      </div>
      <div>
        <Label htmlFor={pointsId}>Баллов</Label>
        <Input
          id={pointsId}
          type="number"
          min={1}
          max={100}
          value={task.points}
          onChange={(e) => onChange({ ...task, points: Math.max(1, Number(e.target.value) || 1) })}
        />
      </div>
    </div>
  );
}

function TaskOptions({
  task,
  onChange,
  availableObjectives,
  availableCriteria,
}: {
  task: InteractiveTask;
  onChange: (t: InteractiveTask) => void;
  availableObjectives: Array<{ code: string; text: string }>;
  availableCriteria: string[];
}) {
  const hasObjectives = availableObjectives.some((o) => o.code);
  const criteria = [...new Set(availableCriteria.map((criterion) => criterion.trim()).filter(Boolean))];
  const { locale } = useUiLocale();
  const isKk = locale === "kk";
  return (
    <details className="group">
      <summary className="text-xs text-slate-500 cursor-pointer select-none">
        {isKk ? "Қосымша баптаулар — ишара, таймер, мақсаттар мен критерийлер" : "Доп. настройки — подсказка, таймер, цели и критерии"}
      </summary>
      <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-3">
          <Label>Подсказка ученику (за показ — штраф на пару баллов)</Label>
          <Input
            value={task.hint ?? ""}
            onChange={(e) => onChange({ ...task, hint: e.target.value })}
            placeholder="Напр. «Вспомните правило порядка действий»"
          />
        </div>
        <div>
          <Label>Таймер (сек, 0 = без)</Label>
          <Input
            type="number"
            min={0}
            max={3600}
            value={task.timeLimitSec ?? 0}
            onChange={(e) =>
              onChange({ ...task, timeLimitSec: Math.max(0, Number(e.target.value) || 0) })
            }
          />
        </div>
        {task.type === "MCQ" && (
          <div className="flex items-center gap-2 mt-5">
            <input
              id={`shuffle-${task.id}`}
              type="checkbox"
              checked={!!task.shuffle}
              onChange={(e) => onChange({ ...task, shuffle: e.target.checked })}
            />
            <Label htmlFor={`shuffle-${task.id}`} className="text-sm font-normal">
              Перемешивать варианты
            </Label>
          </div>
        )}
        <div className="md:col-span-3">
          <Label>Привязка к цели ГОСО</Label>
          {hasObjectives ? (
            <Select
              value={task.objectiveCode ?? "__none__"}
              onValueChange={(v) =>
                onChange({ ...task, objectiveCode: v === "__none__" ? undefined : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите цель из КСП" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— без привязки —</SelectItem>
                {availableObjectives
                  .filter((o) => o.code)
                  .map((o) => (
                    <SelectItem key={o.code} value={o.code}>
                      <span className="font-mono text-xs mr-2">{o.code}</span>
                      {o.text.length > 60 ? o.text.slice(0, 60) + "…" : o.text}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={task.objectiveCode ?? ""}
              onChange={(e) => onChange({ ...task, objectiveCode: e.target.value })}
              placeholder="сначала добавьте цели ГОСО в табе «Цели» — или впишите код вручную"
            />
          )}
        </div>
        <fieldset className="md:col-span-3 space-y-2">
          <legend className="text-sm font-medium">{isKk ? "Байланысты бағалау критерийлері" : "Связанные критерии оценивания"}</legend>
          {criteria.length === 0 ? (
            <p className="text-xs text-slate-500">{isKk ? "Алдымен «Мақсаттар» бөлімінде бағалау критерийлерін қосыңыз." : "Добавьте критерии оценивания во вкладке «Цели», затем свяжите их с заданием."}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {criteria.map((criterion, index) => {
                const id = `criterion-${task.id}-${index}`;
                return (
                  <label key={criterion} htmlFor={id} className="flex items-start gap-2 rounded-lg border border-[#ddd5cb] bg-surface p-2 text-sm">
                    <input
                      id={id}
                      type="checkbox"
                      checked={(task.criterionTexts ?? []).includes(criterion)}
                      onChange={(event) => {
                        const selected = new Set(task.criterionTexts ?? []);
                        if (event.target.checked) selected.add(criterion);
                        else selected.delete(criterion);
                        onChange({ ...task, criterionTexts: [...selected] });
                      }}
                      className="mt-1"
                    />
                    <span>{criterion}</span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      </div>
    </details>
  );
}

function NumericEditor({
  task,
  onChange,
}: {
  task: NumericTask;
  onChange: (t: NumericTask) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div>
        <Label>Правильный ответ</Label>
        <Input
          type="number"
          value={Number.isFinite(task.answer) ? task.answer : 0}
          onChange={(e) => onChange({ ...task, answer: Number(e.target.value) })}
        />
      </div>
      <div>
        <Label>Допуск (±)</Label>
        <Input
          type="number"
          min={0}
          step="any"
          value={task.tolerance ?? 0}
          onChange={(e) =>
            onChange({ ...task, tolerance: Math.max(0, Number(e.target.value) || 0) })
          }
        />
      </div>
      <div>
        <Label>Единица (опц.)</Label>
        <Input
          value={task.unit ?? ""}
          onChange={(e) => onChange({ ...task, unit: e.target.value })}
          placeholder="напр. км/ч, кг, °C"
        />
      </div>
    </div>
  );
}

function McqEditor({
  task,
  onChange,
}: {
  task: McqTask;
  onChange: (t: McqTask) => void;
}) {
  function setOption(i: number, v: string) {
    onChange({ ...task, options: task.options.map((o, idx) => (idx === i ? v : o)) });
  }
  return (
    <div className="space-y-2">
      <Label>Варианты ответов (отметьте правильный)</Label>
      {task.options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="radio"
            name={`mcq-${task.id}`}
            checked={task.correctIndex === i}
            onChange={() => onChange({ ...task, correctIndex: i })}
            className="accent-slate-900"
          />
          <Input
            value={opt}
            onChange={(e) => setOption(i, e.target.value)}
            placeholder={`Вариант ${i + 1}`}
          />
          {task.options.length > 2 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const options = task.options.filter((_, idx) => idx !== i);
                const correctIndex = task.correctIndex === i ? 0 : task.correctIndex > i ? task.correctIndex - 1 : task.correctIndex;
                onChange({ ...task, options, correctIndex });
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange({ ...task, options: [...task.options, ""] })}
      >
        <Plus className="w-4 h-4" /> Вариант
      </Button>
    </div>
  );
}

function TrueFalseEditor({
  task,
  onChange,
}: {
  task: TrueFalseTask;
  onChange: (t: TrueFalseTask) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <Label>Правильный ответ:</Label>
      <label className="inline-flex items-center gap-1 text-sm">
        <input
          type="radio"
          checked={task.correct === true}
          onChange={() => onChange({ ...task, correct: true })}
        />
        Верно
      </label>
      <label className="inline-flex items-center gap-1 text-sm">
        <input
          type="radio"
          checked={task.correct === false}
          onChange={() => onChange({ ...task, correct: false })}
        />
        Неверно
      </label>
    </div>
  );
}

function ShortAnswerEditor({
  task,
  onChange,
}: {
  task: ShortAnswerTask;
  onChange: (t: ShortAnswerTask) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Принимаемые ответы (первый — эталон)</Label>
      {task.acceptedAnswers.map((a, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={a}
            onChange={(e) =>
              onChange({
                ...task,
                acceptedAnswers: task.acceptedAnswers.map((x, idx) =>
                  idx === i ? e.target.value : x,
                ),
              })
            }
          />
          {task.acceptedAnswers.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange({
                  ...task,
                  acceptedAnswers: task.acceptedAnswers.filter((_, idx) => idx !== i),
                })
              }
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange({ ...task, acceptedAnswers: [...task.acceptedAnswers, ""] })
        }
      >
        <Plus className="w-4 h-4" /> Синоним
      </Button>
    </div>
  );
}

function FillBlankEditor({
  task,
  onChange,
}: {
  task: FillBlankTask;
  onChange: (t: FillBlankTask) => void;
}) {
  const blanks = (task.template.match(/___/g) ?? []).length;
  const answers = [...task.answers];
  while (answers.length < blanks) answers.push("");
  if (answers.length > blanks) answers.length = blanks;

  return (
    <div className="space-y-2">
      <div>
        <Label>Шаблон (используйте `___` для пропусков)</Label>
        <Textarea
          rows={2}
          value={task.template}
          onChange={(e) => {
            const template = e.target.value;
            const count = (template.match(/___/g) ?? []).length;
            onChange({ ...task, template, answers: task.answers.slice(0, count).concat(Array(Math.max(0, count - task.answers.length)).fill("")) });
          }}
        />
      </div>
      <div>
        <Label>Ожидаемые ответы ({blanks} шт.)</Label>
        <div className="space-y-1">
          {answers.map((a, i) => (
            <Input
              key={i}
              value={a}
              onChange={(e) =>
                onChange({
                  ...task,
                  answers: answers.map((x, idx) => (idx === i ? e.target.value : x)),
                })
              }
              placeholder={`Пропуск ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchingEditor({
  task,
  onChange,
}: {
  task: MatchingTask;
  onChange: (t: MatchingTask) => void;
}) {
  const n = Math.max(task.left.length, task.right.length);

  function setLeft(i: number, v: string) {
    const left = [...task.left];
    left[i] = v;
    onChange({ ...task, left });
  }
  function setRight(i: number, v: string) {
    const right = [...task.right];
    right[i] = v;
    onChange({ ...task, right });
  }

  function addRow() {
    const leftIndex = task.left.length;
    const rightIndex = task.right.length;
    onChange({
      ...task,
      left: [...task.left, ""],
      right: [...task.right, ""],
      pairs: [...task.pairs, { leftIndex, rightIndex }],
    });
  }

  function removeRow(i: number) {
    onChange({
      ...task,
      left: task.left.filter((_, idx) => idx !== i),
      right: task.right.filter((_, idx) => idx !== i),
      pairs: task.pairs
        .filter((p) => p.leftIndex !== i && p.rightIndex !== i)
        .map((p) => ({
          leftIndex: p.leftIndex > i ? p.leftIndex - 1 : p.leftIndex,
          rightIndex: p.rightIndex > i ? p.rightIndex - 1 : p.rightIndex,
        })),
    });
  }

  return (
    <div className="space-y-2">
      <Label>Пары (левое ↔ правое)</Label>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={task.left[i] ?? ""}
            onChange={(e) => setLeft(i, e.target.value)}
            placeholder="Левое"
          />
          <span className="text-slate-400">↔</span>
          <Input
            value={task.right[i] ?? ""}
            onChange={(e) => setRight(i, e.target.value)}
            placeholder="Правое"
          />
          {n > 2 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeRow(i)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="w-4 h-4" /> Пара
      </Button>
      <p className="text-xs text-slate-500">
        Перемешивание для ученика происходит при отображении; конструктор задаёт
        «правильные» пары по строкам.
      </p>
    </div>
  );
}

function OrderingEditor({
  task,
  onChange,
}: {
  task: OrderingTask;
  onChange: (t: OrderingTask) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Расположите в правильном порядке (сверху вниз)</Label>
      <div className="space-y-1">
        {task.items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-slate-400 w-6">{i + 1}.</span>
            <Input
              value={item}
              onChange={(e) =>
                onChange({
                  ...task,
                  items: task.items.map((x, idx) => (idx === i ? e.target.value : x)),
                })
              }
            />
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => {
                  if (i === 0) return;
                  const items = [...task.items];
                  [items[i - 1], items[i]] = [items[i], items[i - 1]];
                  onChange({
                    ...task,
                    items,
                    correctOrder: items.map((_, idx) => idx),
                  });
                }}
                className="text-xs text-slate-500 hover:text-slate-900"
                aria-label="Вверх"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => {
                  if (i === task.items.length - 1) return;
                  const items = [...task.items];
                  [items[i + 1], items[i]] = [items[i], items[i + 1]];
                  onChange({
                    ...task,
                    items,
                    correctOrder: items.map((_, idx) => idx),
                  });
                }}
                className="text-xs text-slate-500 hover:text-slate-900"
                aria-label="Вниз"
              >
                ▼
              </button>
            </div>
            {task.items.length > 2 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const items = task.items.filter((_, idx) => idx !== i);
                  onChange({
                    ...task,
                    items,
                    correctOrder: items.map((_, idx) => idx),
                  });
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const items = [...task.items, ""];
          onChange({
            ...task,
            items,
            correctOrder: items.map((_, idx) => idx),
          });
        }}
      >
        <Plus className="w-4 h-4" /> Шаг
      </Button>
    </div>
  );
}
