"use client";

import { useState } from "react";
import { Check, Copy, Home, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUiLocale } from "@/components/i18n/use-ui-locale";

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
  const { t } = useUiLocale();
  const a = t.assignments;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(`${planTitle} — домой`);
  const [days, setDays] = useState(14);
  const [selected, setSelected] = useState<Set<string>>(new Set(planTasks.map((t) => t.ref)));
  const [library, setLibrary] = useState<{ fromAssignments: AssignableTask[]; fromPlans: AssignableTask[] } | null>(null);
  const [loadingLib, setLoadingLib] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ code: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function openDialog() {
    setOpen(true);
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
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  }

  async function create() {
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
          daysValid: days,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.code) throw new Error(data?.error || a.createErr);
      setCreated({ code: data.code });
    } catch (e) {
      setError(e instanceof Error ? e.message : a.createErr);
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

  const link = created ? `${window.location.origin}/a/${created.code}` : "";

  return (
    <div className="relative">
      <Button variant="outline" onClick={() => (open ? setOpen(false) : openDialog())}>
        <Home /> {a.assignBtn}
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-[80vh] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-slate-200 bg-surface p-4 shadow-lg">
          {!created ? (
            <div className="space-y-3">
              <div>
                <div className="text-sm font-bold">{a.dialogTitle}</div>
                <div className="text-xs text-slate-500">{a.dialogHint}</div>
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
                      className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${days === d ? "bg-[#2B2D83] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                    >
                      {d} {a.dayUnit}
                    </button>
                  ))}
                </div>
              </div>
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
              <Button onClick={() => void create()} disabled={creating || selected.size === 0} className="w-full">
                {creating ? <><Loader2 className="animate-spin" /> {a.creating}…</> : <>{a.createBtn} ({selected.size})</>}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 text-center">
              <p className="text-sm font-bold">{a.ready} {created.code}</p>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs">
                <span className="flex-1 truncate">{link}</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(link).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  className="inline-flex items-center gap-1 font-medium hover:underline"
                  aria-label={a.copyLink}
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? a.copied : a.copy}
                </button>
              </div>
              <p className="text-xs text-slate-500">{a.sendHint}</p>
              <Button variant="outline" onClick={() => setOpen(false)} className="w-full">{a.close}</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
