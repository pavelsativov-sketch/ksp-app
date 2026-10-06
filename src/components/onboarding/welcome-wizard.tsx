"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeOnboardingAction } from "@/app/actions/onboarding";
import { useUiLocale } from "@/components/i18n/use-ui-locale";

const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Онбординг после регистрации: 3 шага — о себе, первая тема, что дальше. */
export function WelcomeWizard({
  subjects,
  initial,
}: {
  subjects: Array<{ id: string; name: string }>;
  initial: { school: string; subjects: string[]; grades: number[]; topic: string };
}) {
  const { t } = useUiLocale();
  const w = t.welcome;
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [school, setSchool] = useState(initial.school);
  const [pickedSubjects, setPickedSubjects] = useState<string[]>(initial.subjects);
  const [pickedGrades, setPickedGrades] = useState<number[]>(initial.grades);
  const [topic, setTopic] = useState(initial.topic);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(list: string[], v: string, set: (x: string[]) => void) {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }

  function finish(skipTopic = false) {
    setError(null);
    startTransition(async () => {
      const result = await completeOnboardingAction({
        school,
        subjects: pickedSubjects,
        grades: pickedGrades,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const params = new URLSearchParams();
      if (!skipTopic && topic.trim()) params.set("topic", topic.trim());
      if (pickedSubjects[0]) {
        const found = subjects.find((s) => s.name === pickedSubjects[0]);
        if (found) params.set("subjectId", found.id);
      }
      if (pickedGrades[0]) params.set("grade", String(pickedGrades[0]));
      router.push(`/plans/new${params.size ? `?${params}` : ""}`);
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 md:py-16">
      <p className="editorial-kicker">{w.stepOf} {step + 1} {w.of3}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${((step + 1) / 3) * 100}%` }} />
      </div>

      {step === 0 && (
        <section className="mt-6 space-y-5">
          <h1 className="editorial-display text-4xl">{w.whereT}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{w.whereLead}</p>
          <div className="space-y-1.5">
            <Label htmlFor="welcome-school">{w.schoolL}</Label>
            <Input id="welcome-school" value={school} onChange={(e) => setSchool(e.target.value)} placeholder={w.schoolPh} maxLength={200} />
          </div>
          <div>
            <Label>{w.subjectsL}</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {subjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(pickedSubjects, s.name, setPickedSubjects)}
                  aria-pressed={pickedSubjects.includes(s.name)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${pickedSubjects.includes(s.name) ? "bg-[#2B2D83] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>{w.gradesL}</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setPickedGrades(pickedGrades.includes(g) ? pickedGrades.filter((x) => x !== g) : [...pickedGrades, g])}
                  aria-pressed={pickedGrades.includes(g)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${pickedGrades.includes(g) ? "bg-[#2B2D83] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="mt-6 space-y-5">
          <h1 className="editorial-display text-4xl">{w.topicT}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{w.topicLead}</p>
          <div className="space-y-1.5">
            <Label htmlFor="welcome-topic">{w.topicL}</Label>
            <Input id="welcome-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={w.topicPh} maxLength={300} />
          </div>
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm leading-6">
            <p className="font-semibold">{w.nextTitle}</p>
            <p className="mt-1 text-muted-foreground">{w.nextSteps}</p>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="mt-6 space-y-5">
          <h1 className="editorial-display text-4xl">{w.readyT}</h1>
          <div className="grid gap-3">
            {w.cards.map((c) => (
              <div key={c.t} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
                <Check className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                <div><p className="font-semibold">{c.t}</p><p className="text-sm text-muted-foreground">{c.d}</p></div>
              </div>
            ))}
          </div>
        </section>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-8 flex justify-between gap-2">
        <Button variant="outline" onClick={() => (step === 0 ? router.push("/dashboard") : setStep(step - 1))} disabled={pending}>
          <ArrowLeft className="size-4" /> {step === 0 ? w.skipAll : w.back}
        </Button>
        {step < 2 ? (
          <Button onClick={() => setStep(step + 1)} disabled={pending}>{w.next} <ArrowRight className="size-4" /></Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => finish(true)} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : w.toArchive}
            </Button>
            <Button onClick={() => finish(false)} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : w.createFirst} <ArrowRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
