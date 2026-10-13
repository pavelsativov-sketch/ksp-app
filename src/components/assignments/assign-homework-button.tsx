"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Home, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import { QrCard } from "@/components/ksp/qr-card";
import { assignmentPreviewCopy } from "@/components/assignments/assignment-preview-copy";
import type { PublicTask } from "@/lib/ksp/live-quiz";
import { copyText } from "@/lib/clipboard";

export interface AssignableTask {
  ref: string;
  question: string;
  type: string;
  points: number;
  from: string;
}

/** Кнопка «Задать домой»: задания урока + повтор из прошлых выдач и КСП. */
export function AssignHomeworkButton({
  planId,
  planTitle,
  subject,
  grade,
  planTasks,
}: {
  planId: string;
  planTitle: string;
  subject: string;
  grade: number;
  planTasks: AssignableTask[];
}) {
  const { locale, t } = useUiLocale();
  const a = t.assignments;
  const copy = assignmentPreviewCopy[locale];
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"configure" | "preview">("configure");
  const [title, setTitle] = useState(`${planTitle} — домой`);
  const [days, setDays] = useState(14);
  const [feedbackMode, setFeedbackMode] = useState<"none" | "correct_only">("correct_only");
  const [selected, setSelected] = useState<Set<string>>(new Set(planTasks.map((t) => t.ref)));
  const [library, setLibrary] = useState<{ fromAssignments: AssignableTask[]; fromPlans: AssignableTask[] } | null>(null);
  const [loadingLib, setLoadingLib] = useState(false);
  const [creating, setCreating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewTasks, setPreviewTasks] = useState<PublicTask[] | null>(null);
  const [previewFingerprint, setPreviewFingerprint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function openDialog() {
    setOpen(true);
    setStep("configure");
    setPreviewTasks(null);
    setPreviewFingerprint(null);
    setCreated(null);
    setError(null);
    if (library || loadingLib) return;
    setLoadingLib(true);
    fetch("/api/assignments/library")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.fromAssignments)) setLibrary(data);
      })
      .catch(() => {})
      .finally(() => setLoadingLib(false));
  }

  function toggle(ref: string) {
    setPreviewTasks(null);
    setPreviewFingerprint(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  }

  async function preparePreview() {
    setPreviewing(true);
    setPreviewFingerprint(null);
    setError(null);
    try {
      const res = await fetch("/api/assignments/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: [...selected] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.tasks) || data.tasks.length !== selected.size || !/^[a-f\d]{64}$/i.test(data?.fingerprint ?? "")) {
        throw new Error(copy.previewErr);
      }
      setPreviewTasks(data.tasks as PublicTask[]);
      setPreviewFingerprint(data.fingerprint as string);
      setStep("preview");
    } catch {
      setError(copy.previewErr);
    } finally {
      setPreviewing(false);
    }
  }

  async function create() {
    if (!previewFingerprint || !previewTasks?.length) {
      setError(copy.previewErr);
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || planTitle,
          subject,
          grade,
          taskIds: [...selected],
          planId,
          previewFingerprint,
          feedbackMode,
          daysValid: days,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.code || !data?.id) throw new Error(copy.issueErr);
      setCreated({ id: data.id, code: data.code });
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.issueErr);
    } finally {
      setCreating(false);
    }
  }

  function taskRow(t: AssignableTask) {
    return (
      <label key={t.ref} className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/50">
        <input type="checkbox" checked={selected.has(t.ref)} onChange={() => toggle(t.ref)} className="mt-1" />
        <span className="flex-1">{t.question}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{t.points} б.</span>
      </label>
    );
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

  return (
    <div className="relative">
      <Button type="button" variant="outline" aria-expanded={open} aria-haspopup="true" onClick={() => (open ? setOpen(false) : openDialog())}>
        <Home /> {a.assignBtn}
      </Button>
      {open && (
        <Dialog open onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-surface p-4 shadow-lg sm:max-h-[85vh]">
          <DialogTitle className="sr-only">{a.dialogTitle}</DialogTitle>
          {!created ? (
            step === "configure" ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold">{a.dialogTitle}</h2>
                    <p className="text-xs text-slate-500">{a.dialogHint}</p>
                  </div>
                  <Button type="button" variant="ghost" className="min-h-11 min-w-11 shrink-0 p-2" aria-label={a.close} onClick={() => setOpen(false)}><X aria-hidden="true" /></Button>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="assign-title">{a.nameLabel}</Label>
                  <Input id="assign-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
                </div>
                <div>
                  <Label>{a.daysLabel}</Label>
                  <div className="mt-1.5 flex gap-1.5">
                    {[7, 14, 30].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDays(d)}
                        aria-pressed={days === d}
                        className={`min-h-11 rounded-full px-3.5 py-2 text-sm font-medium ${days === d ? "bg-[#2B2D83] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                      >
                        {d} {a.dayUnit}
                      </button>
                    ))}
                  </div>
                </div>
                <fieldset className="space-y-1.5">
                  <legend className="text-sm font-medium">{copy.feedbackTitle}</legend>
                  <div className="grid gap-1.5">
                    {([
                      ["correct_only", copy.feedbackCorrectOnly],
                      ["none", copy.feedbackNone],
                    ] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={feedbackMode === mode}
                        onClick={() => setFeedbackMode(mode)}
                        className={`rounded-lg border px-3 py-2 text-left text-xs ${feedbackMode === mode ? "border-primary bg-primary/5 font-semibold" : "border-border hover:bg-muted/50"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{a.fromLesson} ({planTasks.length})</p>
                  <div className="max-h-44 space-y-1.5 overflow-y-auto">
                    {planTasks.length ? planTasks.map(taskRow) : <p className="text-xs text-slate-500">{a.noTasks}</p>}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{a.repeatH}</p>
                  {loadingLib && <p className="text-xs text-slate-500">{a.loadingLib}</p>}
                  {library && (
                    <div className="max-h-44 space-y-1.5 overflow-y-auto">
                      {[...library.fromAssignments, ...library.fromPlans]
                        .filter((t) => !t.ref.startsWith(`${planId}:`))
                        .slice(0, 60)
                        .map((t) => (
                          <div key={t.ref}>
                            {taskRow({ ...t, question: `${t.question} · ${t.from}` })}
                          </div>
                        ))}
                      {library.fromAssignments.length + library.fromPlans.length === 0 && (
                        <p className="text-xs text-slate-500">{a.nothingRepeat}</p>
                      )}
                    </div>
                  )}
                </div>
                {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
                <Button type="button" onClick={() => void preparePreview()} disabled={previewing || selected.size === 0} className="w-full">
                  {previewing ? <><Loader2 className="animate-spin" /> {copy.previewing}</> : <>{copy.previewBtn} ({selected.size})</>}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <header>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-sm font-bold">{copy.previewTitle}</h2>
                    <Button type="button" variant="ghost" className="min-h-11 min-w-11 shrink-0 p-2" aria-label={a.close} onClick={() => setOpen(false)}><X aria-hidden="true" /></Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{copy.previewHint}</p>
                  <p className="mt-2 text-sm font-medium">{title.trim() || planTitle} · {subject} · {grade} {locale === "kk" ? "сынып" : "класс"} · {copy.daysValid(days)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{copy.feedbackTitle}: {feedbackMode === "none" ? copy.feedbackNone : copy.feedbackCorrectOnly}</p>
                </header>
                <ol className="space-y-3">
                  {previewTasks?.map((task, index) => (
                    <li key={`${task.id}-${index}`}>
                      <article className="space-y-2 rounded-xl border border-border bg-surface p-3">
                        <p className="text-xs font-semibold text-muted-foreground">{copy.taskOf(index + 1, previewTasks.length)} · {copy.points(task.points)}</p>
                        <h3 className="text-sm font-semibold">{task.question}</h3>
                        {task.hint && <p className="text-xs text-amber-800">{copy.hintLabel} {task.hint}</p>}
                        {previewDetails(task)}
                      </article>
                    </li>
                  ))}
                </ol>
                {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => { setStep("configure"); setPreviewTasks(null); setPreviewFingerprint(null); setError(null); }} className="flex-1">
                    {copy.previewBack}
                  </Button>
                  <Button type="button" onClick={() => void create()} disabled={creating || !previewTasks?.length} className="flex-1">
                    {creating ? <><Loader2 className="animate-spin" /> {a.creating}…</> : copy.issueBtn}
                  </Button>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-3 text-center">
              <p className="text-sm font-bold">{copy.readyTitle}: <span className="font-mono">{created.code}</span></p>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs">
                <span className="flex-1 truncate">{link}</span>
                <button
                  type="button"
                  onClick={() => {
                    void copyText(link).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }).catch(() => setError(copy.clipboardError));
                  }}
                  className="inline-flex items-center gap-1 font-medium hover:underline"
                  aria-label={a.copyLink}
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? a.copied : a.copy}
                </button>
              </div>
              {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
              <p className="text-xs text-slate-500">{a.sendHint}</p>
              <div className="text-left">
                <QrCard url={link} title={title.trim() || planTitle} heading={copy.qrTitle} description={copy.qrLead} locale={locale} />
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link href={`/assignments/${created.id}`}>{copy.manageResults}</Link>
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)} className="w-full">{a.close}</Button>
            </div>
          )}
        </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
