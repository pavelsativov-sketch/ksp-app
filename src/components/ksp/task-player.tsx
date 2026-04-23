"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  evaluateTask,
  taskTypeLabel,
  type InteractiveTask,
  type TaskAnswer,
  type TaskResult,
} from "@/lib/ksp/tasks";

export function TaskPlayer({ task }: { task: InteractiveTask }) {
  const [answer, setAnswer] = useState<TaskAnswer>(() => initialAnswer(task));
  const [result, setResult] = useState<TaskResult | null>(null);

  // For MATCHING, shuffle the right column once for the student view
  const shuffledRightOrder = useMemo(
    () =>
      task.type === "MATCHING"
        ? shuffleKeepIndices(task.right.length)
        : [],
    [task],
  );

  function submit() {
    setResult(evaluateTask(task, answer));
  }

  function reset() {
    setAnswer(initialAnswer(task));
    setResult(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            {taskTypeLabel(task.type)} · {task.points} {task.points === 1 ? "балл" : "балла"}
          </p>
          <p className="font-medium">{task.question || "—"}</p>
          {task.hint && <p className="text-xs text-slate-500 mt-1">Подсказка: {task.hint}</p>}
        </div>
      </div>

      <div>
        {task.type === "MCQ" && (
          <McqInput
            task={task}
            answer={answer as Extract<TaskAnswer, { type: "MCQ" }>}
            onChange={setAnswer}
            disabled={!!result}
          />
        )}
        {task.type === "TRUE_FALSE" && (
          <TrueFalseInput
            answer={answer as Extract<TaskAnswer, { type: "TRUE_FALSE" }>}
            onChange={setAnswer}
            disabled={!!result}
          />
        )}
        {task.type === "SHORT_ANSWER" && (
          <ShortAnswerInput
            answer={answer as Extract<TaskAnswer, { type: "SHORT_ANSWER" }>}
            onChange={setAnswer}
            disabled={!!result}
          />
        )}
        {task.type === "FILL_BLANK" && (
          <FillBlankInput
            task={task}
            answer={answer as Extract<TaskAnswer, { type: "FILL_BLANK" }>}
            onChange={setAnswer}
            disabled={!!result}
          />
        )}
        {task.type === "MATCHING" && (
          <MatchingInput
            task={task}
            answer={answer as Extract<TaskAnswer, { type: "MATCHING" }>}
            rightOrder={shuffledRightOrder}
            onChange={setAnswer}
            disabled={!!result}
          />
        )}
        {task.type === "ORDERING" && (
          <OrderingInput
            task={task}
            answer={answer as Extract<TaskAnswer, { type: "ORDERING" }>}
            onChange={setAnswer}
            disabled={!!result}
          />
        )}
      </div>

      {result ? (
        <ResultBanner result={result} />
      ) : (
        <Button type="button" size="sm" onClick={submit}>
          Проверить
        </Button>
      )}

      {result && (
        <Button type="button" variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="w-4 h-4" /> Пройти снова
        </Button>
      )}
    </div>
  );
}

function ResultBanner({ result }: { result: TaskResult }) {
  return (
    <div
      className={
        "flex items-start gap-2 p-2 rounded border " +
        (result.isCorrect
          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
          : "bg-amber-50 border-amber-200 text-amber-800")
      }
    >
      {result.isCorrect ? (
        <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
      ) : (
        <XCircle className="w-5 h-5 mt-0.5 shrink-0" />
      )}
      <div className="text-sm">
        <p className="font-medium">
          {result.score} / {result.maxScore} баллов
        </p>
        <p>{result.feedback}</p>
      </div>
    </div>
  );
}

function initialAnswer(task: InteractiveTask): TaskAnswer {
  switch (task.type) {
    case "MCQ": return { type: "MCQ", selectedIndex: null };
    case "TRUE_FALSE": return { type: "TRUE_FALSE", selected: null };
    case "SHORT_ANSWER": return { type: "SHORT_ANSWER", text: "" };
    case "FILL_BLANK": return { type: "FILL_BLANK", fillers: task.answers.map(() => "") };
    case "MATCHING": return { type: "MATCHING", pairs: [] };
    case "ORDERING": return { type: "ORDERING", order: [...task.correctOrder].sort(() => 0.5 - Math.random()) };
  }
}

function shuffleKeepIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---- per-type inputs ----

function McqInput({
  task,
  answer,
  onChange,
  disabled,
}: {
  task: Extract<InteractiveTask, { type: "MCQ" }>;
  answer: Extract<TaskAnswer, { type: "MCQ" }>;
  onChange: (a: TaskAnswer) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {task.options.map((opt, i) => (
        <label
          key={i}
          className="flex items-center gap-2 p-2 rounded border border-slate-200 hover:bg-slate-50 cursor-pointer"
        >
          <input
            type="radio"
            disabled={disabled}
            checked={answer.selectedIndex === i}
            onChange={() => onChange({ type: "MCQ", selectedIndex: i })}
          />
          <span className="text-sm">{opt || <em className="text-slate-400">—</em>}</span>
        </label>
      ))}
    </div>
  );
}

function TrueFalseInput({
  answer,
  onChange,
  disabled,
}: {
  answer: Extract<TaskAnswer, { type: "TRUE_FALSE" }>;
  onChange: (a: TaskAnswer) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant={answer.selected === true ? "default" : "outline"}
        size="sm"
        disabled={disabled}
        onClick={() => onChange({ type: "TRUE_FALSE", selected: true })}
      >
        Верно
      </Button>
      <Button
        type="button"
        variant={answer.selected === false ? "default" : "outline"}
        size="sm"
        disabled={disabled}
        onClick={() => onChange({ type: "TRUE_FALSE", selected: false })}
      >
        Неверно
      </Button>
    </div>
  );
}

function ShortAnswerInput({
  answer,
  onChange,
  disabled,
}: {
  answer: Extract<TaskAnswer, { type: "SHORT_ANSWER" }>;
  onChange: (a: TaskAnswer) => void;
  disabled: boolean;
}) {
  return (
    <Input
      disabled={disabled}
      value={answer.text}
      onChange={(e) => onChange({ type: "SHORT_ANSWER", text: e.target.value })}
      placeholder="Введите ответ"
    />
  );
}

function FillBlankInput({
  task,
  answer,
  onChange,
  disabled,
}: {
  task: Extract<InteractiveTask, { type: "FILL_BLANK" }>;
  answer: Extract<TaskAnswer, { type: "FILL_BLANK" }>;
  onChange: (a: TaskAnswer) => void;
  disabled: boolean;
}) {
  const parts = task.template.split("___");
  return (
    <div className="text-sm leading-8 flex flex-wrap gap-1 items-baseline">
      {parts.map((part, i) => (
        <span key={i} className="contents">
          <span>{part}</span>
          {i < parts.length - 1 && (
            <Input
              disabled={disabled}
              className="inline-block w-40"
              value={answer.fillers[i] ?? ""}
              onChange={(e) => {
                const fillers = [...answer.fillers];
                while (fillers.length < parts.length - 1) fillers.push("");
                fillers[i] = e.target.value;
                onChange({ type: "FILL_BLANK", fillers });
              }}
            />
          )}
        </span>
      ))}
    </div>
  );
}

function MatchingInput({
  task,
  answer,
  rightOrder,
  onChange,
  disabled,
}: {
  task: Extract<InteractiveTask, { type: "MATCHING" }>;
  answer: Extract<TaskAnswer, { type: "MATCHING" }>;
  rightOrder: number[];
  onChange: (a: TaskAnswer) => void;
  disabled: boolean;
}) {
  const selections = new Map(answer.pairs.map((p) => [p.leftIndex, p.rightIndex]));
  return (
    <div className="space-y-1.5">
      {task.left.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="flex-1 text-sm">{item || "—"}</span>
          <span className="text-slate-400">→</span>
          <select
            disabled={disabled}
            value={selections.get(i) ?? ""}
            onChange={(e) => {
              const pairs = answer.pairs.filter((p) => p.leftIndex !== i);
              if (e.target.value !== "") {
                pairs.push({ leftIndex: i, rightIndex: Number(e.target.value) });
              }
              onChange({ type: "MATCHING", pairs });
            }}
            className="border rounded px-2 py-1 text-sm bg-white"
          >
            <option value="">—</option>
            {rightOrder.map((ri) => (
              <option key={ri} value={ri}>
                {task.right[ri] || `Вариант ${ri + 1}`}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

function OrderingInput({
  task,
  answer,
  onChange,
  disabled,
}: {
  task: Extract<InteractiveTask, { type: "ORDERING" }>;
  answer: Extract<TaskAnswer, { type: "ORDERING" }>;
  onChange: (a: TaskAnswer) => void;
  disabled: boolean;
}) {
  function move(i: number, dir: -1 | 1) {
    const order = [...answer.order];
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    onChange({ type: "ORDERING", order });
  }
  return (
    <ol className="space-y-1">
      {answer.order.map((itemIdx, pos) => (
        <li
          key={pos}
          className="flex items-center gap-2 p-2 rounded border border-slate-200 bg-white"
        >
          <span className="text-xs text-slate-400 w-6">{pos + 1}.</span>
          <span className="flex-1 text-sm">{task.items[itemIdx]}</span>
          <button
            type="button"
            onClick={() => move(pos, -1)}
            disabled={disabled || pos === 0}
            className="text-xs text-slate-500 hover:text-slate-900 disabled:opacity-30"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => move(pos, 1)}
            disabled={disabled || pos === answer.order.length - 1}
            className="text-xs text-slate-500 hover:text-slate-900 disabled:opacity-30"
          >
            ▼
          </button>
        </li>
      ))}
    </ol>
  );
}
