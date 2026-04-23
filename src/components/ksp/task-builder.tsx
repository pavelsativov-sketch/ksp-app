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
} from "@/lib/ksp/tasks";
import { TaskPlayer } from "./task-player";

const TYPES: TaskType[] = [
  "MCQ",
  "TRUE_FALSE",
  "SHORT_ANSWER",
  "FILL_BLANK",
  "MATCHING",
  "ORDERING",
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
}

export function TaskBuilder({ tasks, onChange, context }: TaskBuilderProps) {
  const [newType, setNewType] = useState<TaskType>("MCQ");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  function addTask() {
    onChange([...tasks, emptyTask(newType)]);
  }

  function updateTask(idx: number, task: InteractiveTask) {
    onChange(tasks.map((t, i) => (i === idx ? task : t)));
  }

  function removeTask(idx: number) {
    onChange(tasks.filter((_, i) => i !== idx));
  }

  async function generateTasks() {
    setAiError(null);
    if (!context.topic.trim()) {
      setAiError("Укажите тему урока");
      return;
    }
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/generate-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: context.topic,
          grade: context.grade,
          subject: context.subject,
          stage: context.stage,
          language: context.language,
          count: 3,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { tasks: InteractiveTask[] };
      onChange([...tasks, ...data.tasks]);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Не удалось сгенерировать");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-slate-200 pt-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-700">
          Интерактивные задания {tasks.length > 0 && `(${tasks.length})`}
        </div>
        <div className="flex items-center gap-2">
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
            disabled={aiLoading}
            title="Сгенерировать 3 задания через AI"
          >
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            AI
          </Button>
        </div>
      </div>
      {aiError && (
        <p className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
          {aiError}
        </p>
      )}
      {tasks.length === 0 && (
        <p className="text-xs text-slate-400 italic">
          Пока заданий нет — добавьте ручное или сгенерируйте через AI.
        </p>
      )}
      <div className="space-y-2">
        {tasks.map((task, idx) => (
          <TaskCard
            key={task.id}
            task={task}
            onChange={(t) => updateTask(idx, t)}
            onDelete={() => removeTask(idx)}
          />
        ))}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onChange,
  onDelete,
}: {
  task: InteractiveTask;
  onChange: (t: InteractiveTask) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [preview, setPreview] = useState(false);

  return (
    <div className="border border-slate-200 rounded-lg bg-slate-50/50">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50 rounded-t-lg">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900"
        >
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <span className="uppercase tracking-wider text-xs text-slate-500">
            {taskTypeLabel(task.type)}
          </span>
          <span className="text-slate-900">
            {task.question || <em className="text-slate-400">без вопроса</em>}
          </span>
        </button>
        <div className="flex items-center gap-1">
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

      {open && (
        <div className="p-3 space-y-3">
          <CommonFields task={task} onChange={onChange} />
          {task.type === "MCQ" && <McqEditor task={task} onChange={onChange} />}
          {task.type === "TRUE_FALSE" && <TrueFalseEditor task={task} onChange={onChange} />}
          {task.type === "SHORT_ANSWER" && <ShortAnswerEditor task={task} onChange={onChange} />}
          {task.type === "FILL_BLANK" && <FillBlankEditor task={task} onChange={onChange} />}
          {task.type === "MATCHING" && <MatchingEditor task={task} onChange={onChange} />}
          {task.type === "ORDERING" && <OrderingEditor task={task} onChange={onChange} />}
        </div>
      )}

      {preview && (
        <div className="border-t border-slate-200 bg-white p-3 rounded-b-lg">
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
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-3">
      <div>
        <Label>Вопрос / инструкция</Label>
        <Textarea
          rows={2}
          value={task.question}
          onChange={(e) => onChange({ ...task, question: e.target.value })}
          placeholder="Напр. «Какое из чисел является простым?»"
        />
      </div>
      <div>
        <Label>Баллов</Label>
        <Input
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
                const correctIndex = task.correctIndex >= options.length ? 0 : task.correctIndex;
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
          onChange={(e) => onChange({ ...task, template: e.target.value })}
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
