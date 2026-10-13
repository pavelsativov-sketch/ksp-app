"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n/dictionaries";
import { PLAN_VERSION_SECTIONS, type PlanSection } from "@/lib/plan-sections";
import type { SchoolApprovalCycleView } from "@/lib/school-approvals";
import { schoolApprovalCopy } from "@/lib/school-approval-copy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  schoolId: string;
  planId: string;
  currentUpdatedAt?: string;
  locale: Locale;
  mode: "owner" | "reviewer";
  cycleId?: string;
  availableClasses?: readonly string[];
  initialClassName?: string;
}

interface ApprovalResponse {
  cycles?: SchoolApprovalCycleView[];
  canReview?: boolean;
  canApprove?: boolean;
  canComment?: boolean;
}

function formatDate(value: string, locale: Locale) {
  const language = locale === "kk" ? "kk-KZ" : "ru-RU";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function SchoolApprovalPanel({ schoolId, planId, currentUpdatedAt, locale, mode, cycleId, availableClasses = [], initialClassName = "" }: Props) {
  const copy = schoolApprovalCopy[locale];
  const [cycles, setCycles] = useState<SchoolApprovalCycleView[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [canComment, setCanComment] = useState(false);
  const [schoolClassName, setSchoolClassName] = useState(() => availableClasses.includes(initialClassName) ? initialClassName : "");
  const [section, setSection] = useState<PlanSection>("objectives");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const endpoint = `/api/school/${encodeURIComponent(schoolId)}/approvals`;
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ plan_id: planId });
      if (cycleId) params.set("cycle_id", cycleId);
      const response = await fetch(`${endpoint}?${params.toString()}`, { cache: "no-store" });
      const data = await response.json() as ApprovalResponse & { error?: string };
      if (!response.ok) throw new Error(copy.error);
      setCycles(data.cycles ?? []);
      setCanReview(data.canReview === true);
      setCanApprove(data.canApprove === true);
      setCanComment(data.canComment === true);
    } catch {
      setError(copy.error);
    } finally {
      setLoading(false);
    }
  }, [copy.error, cycleId, endpoint, planId]);

  useEffect(() => {
    let alive = true;
    const fetchCycles = async () => {
      try {
        const params = new URLSearchParams({ plan_id: planId });
        if (cycleId) params.set("cycle_id", cycleId);
        const response = await fetch(`${endpoint}?${params.toString()}`, { cache: "no-store" });
        const data = await response.json() as ApprovalResponse & { error?: string };
        if (!response.ok) throw new Error(copy.error);
        if (alive) {
          setCycles(data.cycles ?? []);
          setCanReview(data.canReview === true);
          setCanApprove(data.canApprove === true);
          setCanComment(data.canComment === true);
        }
      } catch {
        if (alive) setError(copy.error);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void fetchCycles();
    return () => { alive = false; };
  }, [copy.error, cycleId, endpoint, planId]);

  const currentCycle = useMemo(() => cycleId ? cycles.find((cycle) => cycle.id === cycleId) ?? cycles[0] : cycles.at(-1), [cycles, cycleId]);
  const canSubmit = mode === "owner" && schoolClassName.length > 0 && (
    !currentCycle
    || (currentCycle.status === "changes_requested" && currentUpdatedAt !== currentCycle.version_updated_at)
    || (currentCycle.status === "approved" && currentUpdatedAt !== currentCycle.version_updated_at)
  );
  const submitAction = currentCycle?.status === "changes_requested" ? "resubmit" : "submit";
  const versionIsStale = Boolean(currentCycle && currentUpdatedAt && currentUpdatedAt !== currentCycle.version_updated_at);

  const act = async (action: "submit" | "resubmit" | "review" | "comment" | "request_changes" | "approve") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          plan_id: planId,
          ...(currentCycle ? { cycle_id: currentCycle.id } : {}),
          ...(action === "submit" || action === "resubmit" ? { expected_updated_at: currentUpdatedAt } : {}),
          ...(action === "submit" || action === "resubmit" ? { class_name: schoolClassName } : {}),
          ...(action === "comment" || action === "request_changes" ? { section, comment } : {}),
          ...(action === "approve" && comment.trim() ? { comment: comment.trim() } : {}),
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        setError(response.status === 409 ? copy.versionChanged : (data.error || copy.error));
        return;
      }
      setComment("");
      setNotice(copy.saved);
      await refresh();
    } catch {
      setError(copy.error);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground" role="status">{copy.loading}</p>;

  return (
    <Card className="border-border bg-surface">
      <CardHeader>
        <CardTitle>{mode === "reviewer" ? copy.queueTitle : copy.status}</CardTitle>
        <CardDescription>{mode === "owner" ? copy.ownerDescription : copy.snapshotNotice}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
        <div aria-live="polite" className="sr-only">{notice}</div>
        {!currentCycle ? (
          <>
            <p role={mode === "reviewer" ? "status" : undefined} className="text-sm text-muted-foreground">{mode === "owner" ? `${copy.status}: ${copy.draft}` : copy.noCycle}</p>
            {mode === "owner" && <div className="space-y-2">
              {availableClasses.length ? <>
                <label className="block text-sm font-medium" htmlFor="approval-school-class">{copy.schoolClass}</label>
                <select id="approval-school-class" className="min-h-11 w-full rounded-md border border-input bg-background px-3" value={schoolClassName} onChange={(event) => setSchoolClassName(event.target.value)}>
                  <option value="">{copy.selectClass}</option>
                  {availableClasses.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </> : <p className="text-sm text-muted-foreground">{copy.noClasses}</p>}
              {canSubmit && <Button type="button" disabled={busy || !currentUpdatedAt || !schoolClassName} onClick={() => void act(submitAction)}>{busy ? copy.loading : copy.submit}</Button>}
            </div>}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{copy.status}:</span>
              <span className="rounded-full bg-muted px-2.5 py-1">{copy.statusLabels[currentCycle.status]}</span>
              <span className="text-muted-foreground">{copy.cycle} {currentCycle.cycle}</span>
            </div>
            {mode === "owner" && versionIsStale && <p role="status" className="rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-950">{copy.versionChanged}</p>}
            {mode === "reviewer" && (
              <>
                <p className="rounded-md border border-border bg-muted/50 p-3 text-sm">{copy.snapshotNotice}</p>
                <p className="break-all font-mono text-xs text-muted-foreground">{copy.snapshotHash}: {currentCycle.snapshot_hash}</p>
                <section aria-labelledby="approval-snapshot-title" className="space-y-4 rounded-xl border border-border p-4">
                  <h3 id="approval-snapshot-title" className="text-lg font-semibold">{currentCycle.snapshot.title}</h3>
                  <p className="text-sm">{copy.topic}: {currentCycle.snapshot.content.topic}</p>
                  <p className="text-sm">{copy.schoolClass}: {currentCycle.snapshot.school_class_name}</p>
                  <div>
                    <h4 className="font-semibold">{copy.objectives}</h4>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                      {(currentCycle.snapshot.content.learningObjectives ?? []).map((item, index) => <li key={`${item.code}-${index}`}><span className="font-mono">{item.code}</span> — {item.text}</li>)}
                    </ul>
                  </div>
                  {!!currentCycle.snapshot.content.lessonObjectives?.length && <div>
                    <h4 className="font-semibold">{copy.lessonObjectives}</h4>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{currentCycle.snapshot.content.lessonObjectives.map((item, index) => <li key={`lesson-objective-${index}`}>{item}</li>)}</ul>
                  </div>}
                  {!!currentCycle.snapshot.content.assessmentCriteria?.length && <div>
                    <h4 className="font-semibold">{copy.criteria}</h4>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{currentCycle.snapshot.content.assessmentCriteria.map((item, index) => <li key={`criterion-${index}`}>{item}</li>)}</ul>
                  </div>}
                  {!!(currentCycle.snapshot.content.languageObjectives?.terms?.length || currentCycle.snapshot.content.languageObjectives?.phrases?.length) && <div>
                    <h4 className="font-semibold">{copy.languageObjectives}</h4>
                    {!!currentCycle.snapshot.content.languageObjectives?.terms?.length && <p className="mt-1 text-sm"><strong>{copy.terms}:</strong> {currentCycle.snapshot.content.languageObjectives.terms.join(", ")}</p>}
                    {!!currentCycle.snapshot.content.languageObjectives?.phrases?.length && <p className="mt-1 text-sm"><strong>{copy.phrases}:</strong> {currentCycle.snapshot.content.languageObjectives.phrases.join("; ")}</p>}
                  </div>}
                  {currentCycle.snapshot.content.values && <p className="whitespace-pre-wrap text-sm"><strong>{copy.values}:</strong> {currentCycle.snapshot.content.values}</p>}
                  {currentCycle.snapshot.content.crossCurricularLinks && <p className="whitespace-pre-wrap text-sm"><strong>{copy.crossCurricularLinks}:</strong> {currentCycle.snapshot.content.crossCurricularLinks}</p>}
                  {currentCycle.snapshot.content.priorKnowledge && <p className="whitespace-pre-wrap text-sm"><strong>{copy.priorKnowledge}:</strong> {currentCycle.snapshot.content.priorKnowledge}</p>}
                  {(["beginning", "middle", "end"] as const).map((stage) => {
                    const value = currentCycle.snapshot.content.stages?.[stage];
                    if (!value) return null;
                    const heading = stage === "beginning" ? copy.beginning : stage === "middle" ? copy.middle : copy.end;
                    return <div key={stage} className="border-t border-border pt-3">
                      <h4 className="font-semibold">{heading}</h4>
                      {value.time && <p className="mt-1 text-sm"><strong>{copy.time}:</strong> {value.time}</p>}
                      {value.teacherActions && <p className="mt-1 whitespace-pre-wrap text-sm"><strong>{copy.teacherActions}:</strong> {value.teacherActions}</p>}
                      {value.studentActions && <p className="mt-1 whitespace-pre-wrap text-sm"><strong>{copy.studentActions}:</strong> {value.studentActions}</p>}
                      {value.resources && <p className="mt-1 whitespace-pre-wrap text-sm"><strong>{copy.resources}:</strong> {value.resources}</p>}
                      {!!value.tasks?.length && <div className="mt-2"><strong className="text-sm">{copy.tasks}</strong><ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">{value.tasks.map((task, index) => <li key={`${stage}-${index}`}>{task.question}</li>)}</ol></div>}
                    </div>;
                  })}
                  <div className="border-t border-border pt-3">
                    <h4 className="font-semibold">{copy.evaluation}</h4>
                    {currentCycle.snapshot.content.evaluation?.formativeAssessment && <p className="mt-1 whitespace-pre-wrap text-sm"><strong>{copy.formativeAssessment}:</strong> {currentCycle.snapshot.content.evaluation.formativeAssessment}</p>}
                    {currentCycle.snapshot.content.evaluation?.differentiation && <p className="mt-1 whitespace-pre-wrap text-sm"><strong>{copy.differentiation}:</strong> {currentCycle.snapshot.content.evaluation.differentiation}</p>}
                    {currentCycle.snapshot.content.evaluation?.healthAndSafety && <p className="mt-1 whitespace-pre-wrap text-sm"><strong>{copy.healthAndSafety}:</strong> {currentCycle.snapshot.content.evaluation.healthAndSafety}</p>}
                    {currentCycle.snapshot.content.evaluation?.reflection && <p className="mt-1 whitespace-pre-wrap text-sm"><strong>{copy.reflection}:</strong> {currentCycle.snapshot.content.evaluation.reflection}</p>}
                  </div>
                </section>
              </>
            )}

            <section aria-labelledby="approval-history-title">
              <h3 id="approval-history-title" className="font-semibold">{copy.history}</h3>
              <div className="mt-2 space-y-4">
                {(mode === "owner" ? cycles : [currentCycle]).map((historyCycle) => <div key={historyCycle.id}>
                  {mode === "owner" && <p className="mb-2 text-xs font-semibold text-muted-foreground">{copy.cycle} {historyCycle.cycle} · {copy.statusLabels[historyCycle.status]}</p>}
                  <ol className="space-y-3 border-l border-border pl-4">
                    {historyCycle.events.map((event, index) => <li key={`${historyCycle.id}-${event.created_at}-${index}`} className="relative text-sm">
                      <span className="absolute -left-[1.32rem] top-1.5 size-2 rounded-full bg-primary" aria-hidden="true" />
                      <p className="font-medium">{copy.eventLabels[event.action]}</p>
                      <time className="text-xs text-muted-foreground" dateTime={event.created_at}>{formatDate(event.created_at, locale)}</time>
                      {event.section && <p className="mt-1 text-xs text-muted-foreground">{copy.section}: {copy.sectionLabels[event.section]}</p>}
                      {event.comment && <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/60 p-2">{event.comment}</p>}
                    </li>)}
                  </ol>
                </div>)}
              </div>
            </section>

            {mode === "owner" && <div className="space-y-2">
              {availableClasses.length ? <>
                <label className="block text-sm font-medium" htmlFor="approval-school-class">{copy.schoolClass}</label>
                <select id="approval-school-class" className="min-h-11 w-full rounded-md border border-input bg-background px-3" value={schoolClassName} onChange={(event) => setSchoolClassName(event.target.value)}>
                  <option value="">{copy.selectClass}</option>
                  {availableClasses.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </> : <p className="text-sm text-muted-foreground">{copy.noClasses}</p>}
              {canSubmit && <Button type="button" disabled={busy || !currentUpdatedAt || !schoolClassName} onClick={() => void act(submitAction)}>{busy ? copy.loading : submitAction === "resubmit" ? copy.resubmit : copy.submit}</Button>}
            </div>}

            {mode === "reviewer" && canReview && (currentCycle.status === "submitted" || currentCycle.status === "resubmitted") && <Button type="button" disabled={busy} onClick={() => void act("review")}>{busy ? copy.loading : copy.startReview}</Button>}

            {mode === "reviewer" && ((currentCycle.status === "in_review" && (canReview || canApprove || canComment)) || (canComment && (currentCycle.status === "submitted" || currentCycle.status === "resubmitted"))) && <div className="space-y-3 rounded-xl border border-border p-4">
              <h3 className="font-semibold">{copy.comments}</h3>
              {canComment && <>
                <label className="block text-sm font-medium" htmlFor="approval-section">{copy.section}</label>
                <select id="approval-section" className="min-h-11 w-full rounded-md border border-input bg-background px-3" value={section} onChange={(event) => setSection(event.target.value as PlanSection)}>
                  {PLAN_VERSION_SECTIONS.map((item) => <option key={item} value={item}>{copy.sectionLabels[item]}</option>)}
                </select>
                <label className="block text-sm font-medium" htmlFor="approval-comment">{copy.comment}</label>
                <textarea id="approval-comment" className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2" maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={copy.commentPlaceholder} aria-describedby="approval-comment-help" />
                <p id="approval-comment-help" className="text-xs text-muted-foreground">{copy.commentPlaceholder}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" disabled={busy || !comment.trim()} onClick={() => void act("comment")}>{copy.addComment}</Button>
                  {canReview && <Button type="button" variant="outline" disabled={busy || !comment.trim()} onClick={() => void act("request_changes")}>{copy.requestChanges}</Button>}
                </div>
              </>}
              {canApprove && <Button type="button" disabled={busy} onClick={() => void act("approve")}>{copy.approve}</Button>}
            </div>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
