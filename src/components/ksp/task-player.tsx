"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, XCircle, RotateCcw, Lightbulb, Timer, GripVertical } from "lucide-react";
import confetti from "canvas-confetti";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  evaluateTask,
  taskTypeLabel,
  type InteractiveTask,
  type TaskAnswer,
  type TaskResult,
} from "@/lib/ksp/tasks";

export interface TaskPlayerProps {
  task: InteractiveTask;
  /** When set, called after submit with the evaluation result (for quiz mode). */
  onComplete?: (result: TaskResult, hintsUsed: number) => void;
  /** Hide the "Пройти снова" button (quiz mode flows forward). */
  hideReset?: boolean;
}

export function TaskPlayer({ task, onComplete, hideReset }: TaskPlayerProps) {
  const [answer, setAnswer] = useState<TaskAnswer>(() => initialAnswer(task));
  const [result, setResult] = useState<TaskResult | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(
    task.timeLimitSec && task.timeLimitSec > 0 ? task.timeLimitSec : null,
  );
  const rootRef = useRef<HTMLDivElement>(null);

  // Shuffle right column in matching once per task instance (for student view).
  const shuffledRightOrder = useMemo(
    () => (task.type === "MATCHING" ? shuffleIndices(task.right.length) : []),
    [task],
  );

  // Shuffle MCQ options when task.shuffle is true.
  const mcqOrder = useMemo(() => {
    if (task.type !== "MCQ") return [] as number[];
    if (!task.shuffle) return task.options.map((_, i) => i);
    return shuffleIndices(task.options.length);
  }, [task]);

  // Timer countdown: auto-submit on zero.
  useEffect(() => {
    if (timeLeft === null || result) return;
    if (timeLeft <= 0) {
      submit();
      return;
    }
    const h = setTimeout(() => setTimeLeft((t) => (t === null ? null : t - 1)), 1000);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, result]);

  function submit() {
    const base = evaluateTask(task, answer);
    const penalty = hintsUsed * 2;
    const finalScore = Math.max(0, base.score - penalty);
    const final: TaskResult = {
      ...base,
      score: finalScore,
      feedback:
        hintsUsed > 0
          ? `${base.feedback} (−${penalty} за подсказки)`
          : base.feedback,
    };
    setResult(final);
    setTimeLeft(null);
    if (final.isCorrect) {
      fireConfetti(rootRef.current);
    } else {
      setShakeKey((k) => k + 1);
    }
    onComplete?.(final, hintsUsed);
  }

  function reset() {
    setAnswer(initialAnswer(task));
    setResult(null);
    setHintsUsed(0);
    setTimeLeft(task.timeLimitSec && task.timeLimitSec > 0 ? task.timeLimitSec : null);
  }

  return (
    <div ref={rootRef} className="space-y-3 relative">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <span>
              {taskTypeLabel(task.type)} · {task.points}{" "}
              {pluralPoints(task.points)}
            </span>
            {timeLeft !== null && !result && (
              <span
                className={
                  "inline-flex items-center gap-1 font-mono " +
                  (timeLeft <= 5 ? "text-red-600 animate-pulse" : "text-slate-500")
                }
              >
                <Timer className="w-3 h-3" /> {formatTime(timeLeft)}
              </span>
            )}
          </p>
          <p className="font-medium">{task.question || "—"}</p>
        </div>
      </div>

      <div
        key={shakeKey}
        className={shakeKey > 0 && !result?.isCorrect ? "animate-[shake_0.4s_ease-in-out]" : ""}
      >
        {task.type === "MCQ" && (
          <McqInput
            task={task}
            order={mcqOrder}
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
        {task.type === "NUMERIC" && (
          <NumericInput
            task={task}
            answer={answer as Extract<TaskAnswer, { type: "NUMERIC" }>}
            onChange={setAnswer}
            disabled={!!result}
          />
        )}
      </div>

      {task.hint && !result && (
        <HintBlock
          hint={task.hint}
          used={hintsUsed}
          onShow={() => setHintsUsed((n) => n + 1)}
        />
      )}

      {result ? (
        <ResultBanner result={result} />
      ) : (
        <Button type="button" size="sm" onClick={submit}>
          Проверить
        </Button>
      )}

      {result && !hideReset && (
        <Button type="button" variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="w-4 h-4" /> Пройти снова
        </Button>
      )}
    </div>
  );
}

function HintBlock({
  hint,
  used,
  onShow,
}: {
  hint: string;
  used: number;
  onShow: () => void;
}) {
  if (used === 0) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-amber-700 hover:text-amber-800"
        onClick={onShow}
      >
        <Lightbulb className="w-4 h-4" /> Показать подсказку (−2 балла)
      </Button>
    );
  }
  return (
    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-start gap-2">
      <Lightbulb className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{hint}</span>
    </div>
  );
}

function ResultBanner({ result }: { result: TaskResult }) {
  return (
    <div
      className={
        "flex items-start gap-2 p-2 rounded border transition-colors " +
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
          {result.score} / {result.maxScore} {pluralPoints(result.maxScore)}
        </p>
        <p>{result.feedback}</p>
      </div>
    </div>
  );
}

function initialAnswer(task: InteractiveTask): TaskAnswer {
  switch (task.type) {
    case "MCQ":
      return { type: "MCQ", selectedIndex: null };
    case "TRUE_FALSE":
      return { type: "TRUE_FALSE", selected: null };
    case "SHORT_ANSWER":
      return { type: "SHORT_ANSWER", text: "" };
    case "FILL_BLANK":
      return { type: "FILL_BLANK", fillers: task.answers.map(() => "") };
    case "MATCHING":
      return { type: "MATCHING", pairs: [] };
    case "ORDERING": {
      // Start student with items shuffled (but not accidentally the correct order)
      const n = task.correctOrder.length;
      let order = shuffleIndices(n);
      if (order.every((v, i) => v === task.correctOrder[i]) && n > 1) {
        order = [...order];
        [order[0], order[1]] = [order[1], order[0]];
      }
      return { type: "ORDERING", order };
    }
    case "NUMERIC":
      return { type: "NUMERIC", value: null };
  }
}

function shuffleIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pluralPoints(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return "баллов";
  if (last === 1) return "балл";
  if (last >= 2 && last <= 4) return "балла";
  return "баллов";
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function fireConfetti(root: HTMLElement | null) {
  const rect = root?.getBoundingClientRect();
  const origin =
    rect
      ? {
          x: (rect.left + rect.width / 2) / window.innerWidth,
          y: (rect.top + 20) / window.innerHeight,
        }
      : { x: 0.5, y: 0.4 };
  void confetti({
    particleCount: 80,
    spread: 70,
    startVelocity: 35,
    origin,
    zIndex: 9999,
  });
}

// ---- per-type inputs ----

function McqInput({
  task,
  order,
  answer,
  onChange,
  disabled,
}: {
  task: Extract<InteractiveTask, { type: "MCQ" }>;
  order: number[];
  answer: Extract<TaskAnswer, { type: "MCQ" }>;
  onChange: (a: TaskAnswer) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {order.map((i) => (
        <label
          key={i}
          className={
            "flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors " +
            (answer.selectedIndex === i
              ? "border-slate-900 bg-slate-50"
              : "border-slate-200 hover:bg-slate-50")
          }
        >
          <input
            type="radio"
            disabled={disabled}
            checked={answer.selectedIndex === i}
            onChange={() => onChange({ type: "MCQ", selectedIndex: i })}
          />
          <span className="text-sm">
            {task.options[i] || <em className="text-slate-400">—</em>}
          </span>
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

function NumericInput({
  task,
  answer,
  onChange,
  disabled,
}: {
  task: Extract<InteractiveTask, { type: "NUMERIC" }>;
  answer: Extract<TaskAnswer, { type: "NUMERIC" }>;
  onChange: (a: TaskAnswer) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        step="any"
        disabled={disabled}
        className="max-w-[200px]"
        value={answer.value === null ? "" : answer.value}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") onChange({ type: "NUMERIC", value: null });
          else onChange({ type: "NUMERIC", value: Number(raw) });
        }}
        placeholder="Ответ"
      />
      {task.unit && <span className="text-sm text-slate-500">{task.unit}</span>}
    </div>
  );
}

// ---- MATCHING (drag-and-drop) ----

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
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));
  const assigned = new Map<number, number>(
    answer.pairs.map((p) => [p.rightIndex, p.leftIndex]),
  );
  const unplaced = rightOrder.filter((ri) => !assigned.has(ri));

  function setPair(rightIdx: number, leftIdx: number | null) {
    const without = answer.pairs.filter((p) => p.rightIndex !== rightIdx);
    if (leftIdx === null) {
      onChange({ type: "MATCHING", pairs: without });
    } else {
      // Also kick out any existing pair that used this leftIdx (1:1 match).
      const stripped = without.filter((p) => p.leftIndex !== leftIdx);
      onChange({ type: "MATCHING", pairs: [...stripped, { leftIndex: leftIdx, rightIndex: rightIdx }] });
    }
  }

  function handleDragEnd(ev: DragEndEvent) {
    if (disabled) return;
    const rightIdx = Number(String(ev.active.id).replace("r-", ""));
    const overId = ev.over?.id;
    if (overId === undefined) return;
    if (overId === "tray") {
      setPair(rightIdx, null);
      return;
    }
    const leftIdx = Number(String(overId).replace("l-", ""));
    setPair(rightIdx, leftIdx);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-[1fr_1fr] gap-4">
        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-wider text-slate-500">Слева</p>
          {task.left.map((item, i) => (
            <LeftSlot key={i} index={i}>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm">{item || "—"}</span>
              </div>
              {[...assigned.entries()]
                .filter(([, leftIdx]) => leftIdx === i)
                .map(([rightIdx]) => (
                  <DraggableRight
                    key={rightIdx}
                    rightIdx={rightIdx}
                    label={task.right[rightIdx] || `Вариант ${rightIdx + 1}`}
                    disabled={disabled}
                  />
                ))}
            </LeftSlot>
          ))}
        </div>
        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Перетащите справа
          </p>
          <Tray>
            {unplaced.length === 0 && (
              <p className="text-xs text-slate-400 italic p-2">Все перенесены</p>
            )}
            {unplaced.map((ri) => (
              <DraggableRight
                key={ri}
                rightIdx={ri}
                label={task.right[ri] || `Вариант ${ri + 1}`}
                disabled={disabled}
              />
            ))}
          </Tray>
        </div>
      </div>
    </DndContext>
  );
}

function LeftSlot({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `l-${index}` });
  return (
    <div
      ref={setNodeRef}
      className={
        "min-h-[50px] p-2 rounded border-2 border-dashed transition-colors " +
        (isOver ? "border-slate-900 bg-slate-100" : "border-slate-200 bg-white")
      }
    >
      {children}
    </div>
  );
}

function Tray({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "tray" });
  return (
    <div
      ref={setNodeRef}
      className={
        "min-h-[80px] p-2 rounded border-2 border-dashed space-y-1 transition-colors " +
        (isOver ? "border-slate-900 bg-slate-100" : "border-slate-200 bg-slate-50")
      }
    >
      {children}
    </div>
  );
}

function DraggableRight({
  rightIdx,
  label,
  disabled,
}: {
  rightIdx: number;
  label: string;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `r-${rightIdx}`,
    disabled,
  });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    touchAction: "none",
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={
        "flex items-center gap-2 px-2 py-1.5 rounded border bg-white text-sm " +
        (disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing") +
        " border-slate-300 shadow-sm"
      }
    >
      <GripVertical className="w-4 h-4 text-slate-400 shrink-0" />
      <span>{label}</span>
    </div>
  );
}

// ---- ORDERING (sortable) ----

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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(ev: DragEndEvent) {
    if (disabled) return;
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const oldIdx = answer.order.findIndex((v) => `o-${v}` === active.id);
    const newIdx = answer.order.findIndex((v) => `o-${v}` === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onChange({ type: "ORDERING", order: arrayMove(answer.order, oldIdx, newIdx) });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={answer.order.map((v) => `o-${v}`)}
        strategy={verticalListSortingStrategy}
      >
        <ol className="space-y-1">
          {answer.order.map((itemIdx, pos) => (
            <SortableItem
              key={`o-${itemIdx}`}
              id={`o-${itemIdx}`}
              position={pos + 1}
              label={task.items[itemIdx]}
              disabled={disabled}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({
  id,
  position,
  label,
  disabled,
}: {
  id: string;
  position: number;
  label: string;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={
        "flex items-center gap-2 p-2 rounded border bg-white touch-none " +
        (disabled ? "border-slate-200" : "border-slate-300 shadow-sm")
      }
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        disabled={disabled}
        aria-label="Перетащить"
        className={
          "text-slate-400 " + (disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing")
        }
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="text-xs text-slate-400 w-6">{position}.</span>
      <span className="flex-1 text-sm">{label}</span>
    </li>
  );
}
