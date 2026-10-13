"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrCard } from "@/components/ksp/qr-card";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import { assignmentPreviewCopy } from "@/components/assignments/assignment-preview-copy";
import type { PublicTask } from "@/lib/ksp/live-quiz";

type FeedbackMode = "none" | "correct_only";

export function EditedReissueForm({
  sourceId,
  sourceTitle,
  subject,
  grade,
  sourceFeedbackMode,
  sourceFingerprint,
  tasks,
}: {
  sourceId: string;
  sourceTitle: string;
  subject: string | null;
  grade: number | null;
  sourceFeedbackMode: FeedbackMode;
  sourceFingerprint: string;
  tasks: PublicTask[];
}) {
  const { locale } = useUiLocale();
  const copy = assignmentPreviewCopy[locale];
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"edit" | "preview">("edit");
  const [title, setTitle] = useState(`${sourceTitle} — ${locale === "kk" ? "қайталау" : "повтор"}`);
  const [days, setDays] = useState(14);
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>(sourceFeedbackMode);
  const [edits, setEdits] = useState(() => tasks.map((task) => ({ id: task.id, question: task.question, hint: task.hint ?? "" })));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);

  function updateTask(index: number, field: "question" | "hint", value: string) {
    setEdits((current) => current.map((task, i) => i === index ? { ...task, [field]: value } : task));
  }

  async function createReissue() {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch(`/api/assignments/${sourceId}/reissue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), daysValid: days, feedbackMode, sourceFingerprint, tasks: edits }),
      });
      const data = await response.json().catch(() => null);
      if (response.status === 409 && data?.error === "source_changed") throw new Error(copy.reissueStale);
      if (!response.ok || typeof data?.id !== "string" || typeof data?.code !== "string") throw new Error(copy.reissueErr);
      setCreated({ id: data.id, code: data.code });
    } catch (error) {
      setError(error instanceof Error ? error.message : copy.reissueErr);
    } finally {
      setCreating(false);
    }
  }

  function previewDetails(task: PublicTask) {
    switch (task.type) {
      case "MCQ":
        return <ol className="ml-5 list-[upper-alpha] space-y-1">{task.options.map((option, index) => <li key={index}>{option}</li>)}</ol>;
      case "TRUE_FALSE":
        return <p className="text-sm text-muted-foreground">{copy.booleanTrue} / {copy.booleanFalse}</p>;
      case "SHORT_ANSWER":
        return <div className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">{copy.answerField}</div>;
      case "FILL_BLANK":
        return <p className="text-sm">{task.template}</p>;
      case "MATCHING":
        return <div className="space-y-2"><ul className="space-y-1">{task.left.map((left, index) => <li key={index}>{left} <span aria-hidden="true">→</span> ______</li>)}</ul><p className="text-xs text-muted-foreground">{task.right.join(" · ")}</p></div>;
      case "ORDERING":
        return <ol className="ml-5 list-decimal space-y-1">{task.items.map((item, index) => <li key={index}>{item}</li>)}</ol>;
      case "NUMERIC":
        return <div className="flex items-center gap-2"><div className="h-9 flex-1 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">{copy.answerField}</div>{task.unit && <span className="text-sm">{task.unit}</span>}</div>;
    }
  }

  const link = created && typeof window !== "undefined" ? `${window.location.origin}/a/${created.code}` : "";
  const previewTasks = tasks.map((task, index) => ({ ...task, question: edits[index]?.question ?? task.question, hint: edits[index]?.hint || undefined }));

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" aria-expanded={open} onClick={() => { setOpen((value) => !value); setError(null); }}>
        {copy.reissueBtn}
      </Button>
      {open && (
        <section aria-label={copy.reissueTitle} className="space-y-4 rounded-xl border border-border bg-surface p-4">
          {!created ? step === "edit" ? (
            <div className="space-y-4">
              <header>
                <h2 className="text-base font-semibold">{copy.reissueTitle}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{copy.reissueLead}</p>
              </header>
              <div className="space-y-1.5">
                <label htmlFor={`reissue-title-${sourceId}`} className="text-sm font-medium">{copy.titleLabel}</label>
                <Input id={`reissue-title-${sourceId}`} value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{copy.daysValid(days)}</legend>
                <div className="flex gap-2">
                  {[7, 14, 30].map((value) => <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)} className={`rounded-full border px-3 py-1.5 text-sm ${days === value ? "border-primary bg-primary/5 font-semibold" : "border-border"}`}>{value}</button>)}
                </div>
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{copy.feedbackTitle}</legend>
                <div className="grid gap-2">
                  {([["correct_only", copy.feedbackCorrectOnly], ["none", copy.feedbackNone]] as const).map(([mode, label]) => <button key={mode} type="button" aria-pressed={feedbackMode === mode} onClick={() => setFeedbackMode(mode)} className={`rounded-lg border px-3 py-2 text-left text-sm ${feedbackMode === mode ? "border-primary bg-primary/5 font-semibold" : "border-border"}`}>{label}</button>)}
                </div>
              </fieldset>
              <ol className="space-y-3">
                {tasks.map((task, index) => (
                  <li key={task.id} className="space-y-3 rounded-xl border border-border p-3">
                    <p className="text-xs font-semibold text-muted-foreground">{copy.taskOf(index + 1, tasks.length)} · {copy.points(task.points)}</p>
                    <div className="space-y-1.5">
                      <label htmlFor={`reissue-question-${sourceId}-${index}`} className="text-sm font-medium">{copy.questionLabel}</label>
                      <textarea id={`reissue-question-${sourceId}-${index}`} value={edits[index]?.question ?? ""} maxLength={5000} rows={3} onChange={(event) => updateTask(index, "question", event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor={`reissue-hint-${sourceId}-${index}`} className="text-sm font-medium">{copy.editHintLabel}</label>
                      <textarea id={`reissue-hint-${sourceId}-${index}`} value={edits[index]?.hint ?? ""} maxLength={2000} rows={2} onChange={(event) => updateTask(index, "hint", event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                    </div>
                  </li>
                ))}
              </ol>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button type="button" className="w-full" disabled={!title.trim() || edits.some((task) => !task.question.trim())} onClick={() => { setError(null); setStep("preview"); }}>{copy.previewBtn}</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <header aria-live="polite">
                <h2 className="text-base font-semibold">{copy.previewTitle}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{copy.previewHint}</p>
                <p className="mt-2 text-sm font-medium">{title} · {subject ?? "—"} · {grade ?? "—"} {locale === "kk" ? "сынып" : "класс"} · {copy.daysValid(days)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{copy.feedbackTitle}: {feedbackMode === "none" ? copy.feedbackNone : copy.feedbackCorrectOnly}</p>
              </header>
              <ol className="space-y-3">
                {previewTasks.map((task, index) => (
                  <li key={`${task.id}-${index}`}>
                    <article className="space-y-2 rounded-xl border border-border p-3">
                      <p className="text-xs font-semibold text-muted-foreground">{copy.taskOf(index + 1, previewTasks.length)} · {copy.points(task.points)}</p>
                      <h3 className="text-sm font-semibold">{task.question}</h3>
                      {task.hint && <p className="text-xs text-amber-800">{copy.hintLabel} {task.hint}</p>}
                      {previewDetails(task)}
                    </article>
                  </li>
                ))}
              </ol>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => { setStep("edit"); setError(null); }}>{copy.previewBack}</Button>
                <Button type="button" disabled={creating} onClick={() => void createReissue()}>{copy.issueBtn}</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="font-semibold">{copy.readyTitle}: <span className="font-mono">{created.code}</span></p>
              <QrCard url={link} title={title} heading={copy.qrTitle} description={copy.qrLead} locale={locale} />
              <Button asChild variant="outline" className="w-full"><Link href={`/assignments/${created.id}`}>{copy.manageResults}</Link></Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(false)}>{locale === "kk" ? "Жабу" : "Закрыть"}</Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
