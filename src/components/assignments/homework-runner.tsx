"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PublicAssignment } from "@/lib/assignments";
import type { PublicTask } from "@/lib/ksp/live-quiz";
import type { TaskAnswer } from "@/lib/ksp/tasks";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import { assignmentPreviewCopy } from "@/components/assignments/assignment-preview-copy";

type SubmitResult = {
  score: number;
  maxScore: number;
  isBest: boolean;
  attempts: number;
  details: Array<{ correct: boolean; summary: string | null }>;
};

function emptyAnswer(task: PublicTask): TaskAnswer {
  switch (task.type) {
    case "MCQ": return { type: "MCQ", selectedIndex: null };
    case "TRUE_FALSE": return { type: "TRUE_FALSE", selected: null };
    case "SHORT_ANSWER": return { type: "SHORT_ANSWER", text: "" };
    case "FILL_BLANK": return { type: "FILL_BLANK", fillers: Array(task.blanks).fill("") };
    case "MATCHING": return { type: "MATCHING", pairs: [] };
    case "ORDERING": return { type: "ORDERING", order: task.items.map((_, i) => i) };
    case "NUMERIC": return { type: "NUMERIC", value: null };
  }
}

function AnswerInput({
  task,
  answer,
  onChange,
}: {
  task: PublicTask;
  answer: TaskAnswer;
  onChange: (a: TaskAnswer) => void;
}) {
  const { t } = useUiLocale();
  const r = t.runner;
  const h = t.handouts;
  if (task.type === "MCQ" && answer.type === "MCQ") {
    return (
      <div className="space-y-2">
        {task.options.map((opt, i) => (
          <label key={i} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${answer.selectedIndex === i ? "border-primary bg-primary/5" : "border-border"}`}>
            <input type="radio" name={`q-${task.id}`} checked={answer.selectedIndex === i} onChange={() => onChange({ type: "MCQ", selectedIndex: i })} />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    );
  }
  if (task.type === "TRUE_FALSE" && answer.type === "TRUE_FALSE") {
    return (
      <div className="flex gap-2">
        {([true, false] as const).map((v) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange({ type: "TRUE_FALSE", selected: v })}
            className={`flex-1 rounded-xl border p-3 font-medium ${answer.selected === v ? "border-primary bg-primary/5" : "border-border"}`}
          >
            {v ? h.trueLabel : h.falseLabel}
          </button>
        ))}
      </div>
    );
  }
  if (task.type === "SHORT_ANSWER" && answer.type === "SHORT_ANSWER") {
    return <Input value={answer.text} onChange={(e) => onChange({ type: "SHORT_ANSWER", text: e.target.value })} placeholder={r.answerPh} />;
  }
  if (task.type === "FILL_BLANK" && answer.type === "FILL_BLANK") {
    const parts = task.template.split("___");
    return (
      <div className="space-y-2">
        {parts.map((part, i) => (
          <div key={i} className="flex items-center gap-2">
            {part && <span className="text-sm text-muted-foreground">{part}</span>}
            {i < answer.fillers.length && (
              <Input
                value={answer.fillers[i]}
                onChange={(e) => {
                  const fillers = [...answer.fillers];
                  fillers[i] = e.target.value;
                  onChange({ type: "FILL_BLANK", fillers });
                }}
                placeholder={`${r.blankPh} ${i + 1}`}
                className="max-w-56"
              />
            )}
          </div>
        ))}
      </div>
    );
  }
  if (task.type === "MATCHING" && answer.type === "MATCHING") {
    const chosen = new Map(answer.pairs.map((p) => [p.leftIndex, p.rightIndex]));
    return (
      <div className="space-y-2">
        {task.left.map((left, li) => (
          <div key={li} className="flex items-center gap-2">
            <span className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm">{left}</span>
            <span className="text-muted-foreground">→</span>
            <select
              value={chosen.get(li) ?? ""}
              onChange={(e) => {
                const rightIndex = Number(e.target.value);
                const pairs = answer.pairs.filter((p) => p.leftIndex !== li && p.rightIndex !== rightIndex);
                if (e.target.value !== "") pairs.push({ leftIndex: li, rightIndex });
                onChange({ type: "MATCHING", pairs });
              }}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              aria-label={`${r.matchFor} «${left}»`}
            >
              <option value="">{r.selectPh}</option>
              {task.right.map((right, ri) => (
                <option key={ri} value={ri}>{right}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    );
  }
  if (task.type === "ORDERING" && answer.type === "ORDERING") {
    const move = (from: number, dir: -1 | 1) => {
      const order = [...answer.order];
      const to = from + dir;
      if (to < 0 || to >= order.length) return;
      [order[from], order[to]] = [order[to], order[from]];
      onChange({ type: "ORDERING", order });
    };
    return (
      <ol className="space-y-2">
        {answer.order.map((itemIndex, pos) => (
          <li key={itemIndex} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
            <span className="font-bold text-muted-foreground">{pos + 1}.</span>
            <span className="flex-1">{task.items[itemIndex]}</span>
            <button type="button" onClick={() => move(pos, -1)} disabled={pos === 0} aria-label={r.up} className="rounded px-2 py-1 hover:bg-muted disabled:opacity-30">↑</button>
            <button type="button" onClick={() => move(pos, 1)} disabled={pos === answer.order.length - 1} aria-label={r.down} className="rounded px-2 py-1 hover:bg-muted disabled:opacity-30">↓</button>
          </li>
        ))}
      </ol>
    );
  }
  if (task.type === "NUMERIC" && answer.type === "NUMERIC") {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          value={answer.value ?? ""}
          onChange={(e) => onChange({ type: "NUMERIC", value: e.target.value === "" ? null : Number(e.target.value) })}
          placeholder={r.numPh}
          className="max-w-48"
        />
        {task.unit && <span className="text-sm text-muted-foreground">{task.unit}</span>}
      </div>
    );
  }
  return null;
}

export function HomeworkRunner({ assignment }: { assignment: PublicAssignment }) {
  const { locale, t } = useUiLocale();
  const r = t.runner;
  const copy = assignmentPreviewCopy[locale];
  const [name, setName] = useState("");
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<TaskAnswer[]>(() => assignment.tasks.map(emptyAnswer));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  if (!started) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
        <p className="editorial-kicker">{r.kicker}</p>
        <h1 className="editorial-display text-3xl">{assignment.title}</h1>
        <p className="text-sm text-muted-foreground">{r.tasksW}: {assignment.total} · {r.noLogin}</p>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={r.namePh} maxLength={100} />
        <Button onClick={() => name.trim() && setStarted(true)} disabled={!name.trim()} className="w-full">
          {r.start} <ArrowRight className="size-4" />
        </Button>
      </div>
    );
  }

  if (result) {
    const pct = result.maxScore ? Math.round((result.score / result.maxScore) * 100) : 0;
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="editorial-kicker">{r.resultKicker} · {name}</p>
          <p className="editorial-display mt-2 text-5xl">{result.score} <span className="text-2xl text-muted-foreground">/ {result.maxScore}</span></p>
          <p className="mt-2 text-sm text-muted-foreground">
            {pct >= 85 ? r.excellent : pct >= 60 ? r.good : r.retry}
            {!result.isBest && ` ${r.keptBest}`}
          </p>
        </div>
        <div className="space-y-3">
          {assignment.tasks.map((task, i) => {
            const detail = result.details[i];
            return (
              <div key={task.id} className="rounded-xl border border-border bg-surface p-4">
                <p className="flex items-start gap-2 text-sm font-medium">
                  {detail?.correct
                    ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    : <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />}
                  {i + 1}. {task.question}
                </p>
                {detail && (
                  detail.correct && detail.summary ? (
                    <p className="mt-2 text-sm text-muted-foreground">{detail.summary}</p>
                  ) : detail.correct ? (
                    <p className="mt-2 text-sm text-muted-foreground">{copy.feedbackDisabled}</p>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">{copy.safeIncorrect}</p>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const task = assignment.tasks[step];
  const isLast = step === assignment.tasks.length - 1;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/assignments/code/${assignment.code}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), answers }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.score !== "number") throw new Error(data?.error || r.sendErr);
      setResult(data as SubmitResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : r.sendErr);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-12">
      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{assignment.title} · {name}</span>
          <span>{r.taskOf.replace("{a}", String(step + 1)).replace("{b}", String(assignment.total))}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${((step + 1) / assignment.total) * 100}%` }} />
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{r.points.replace("{n}", String(task.points))}</p>
        <h2 className="mt-1 text-lg font-semibold">{task.question}</h2>
        {task.hint && <p className="mt-1 text-sm text-amber-800">{r.hintL} {task.hint}</p>}
        <div className="mt-4">
          <AnswerInput
            task={task}
            answer={answers[step]}
            onChange={(a) => setAnswers((prev) => prev.map((x, i) => (i === step ? a : x)))}
          />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting}>
          <ArrowLeft className="size-4" /> {r.back}
        </Button>
        {!isLast ? (
          <Button onClick={() => setStep((s) => s + 1)}>{r.next} <ArrowRight className="size-4" /></Button>
        ) : (
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {r.send}
          </Button>
        )}
      </div>
    </div>
  );
}
