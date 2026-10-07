"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Lesson = { number: number; topic: string; planned_date: string; actual_date?: string; status: "planned" | "completed" | "skipped" | "rescheduled" };
type Plan = { id: string; subject: string; class_name: string; academic_year: string; total_hours: number; lessons: Lesson[] };
const statusLabels: Record<Lesson["status"], string> = { planned: "Запланировано", completed: "Пройдено", rescheduled: "Перенесено", skipped: "Пропущено" };

function localDate() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

export function CurriculumManager({ schoolId, initialPlans, academicYear }: { schoolId: string; initialPlans: Plan[]; academicYear: string }) {
  const router = useRouter();
  const [plans, setPlans] = useState(initialPlans);
  const [form, setForm] = useState({ subject: "", className: "", academicYear, topics: "", startDate: localDate() });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/school/${schoolId}/curriculum`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, topics: form.topics.split(/\r?\n/).map((topic) => topic.trim()).filter(Boolean) }) });
      const data = await response.json() as { error?: string; plan?: Plan };
      if (!response.ok) throw new Error(data.error ?? "Не удалось сохранить КТП.");
      if (data.plan) setPlans((previous) => [...previous, data.plan!]);
      setForm((previous) => ({ ...previous, subject: "", className: "", topics: "" }));
      setNotice("Программа сохранена.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Сеть недоступна.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(planId: string, lessonNumber: number, status: Lesson["status"]) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/school/${schoolId}/curriculum`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ curriculumId: planId, lessonNumber, status, actualDate: status === "completed" ? localDate() : undefined }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось обновить урок.");
      setPlans((previous) => previous.map((plan) => plan.id !== planId ? plan : { ...plan, lessons: plan.lessons.map((lesson) => lesson.number === lessonNumber ? { ...lesson, status, actual_date: status === "completed" ? localDate() : undefined } : lesson) }));
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Сеть недоступна.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-5">
    <Card>
      <CardHeader><CardTitle className="text-base">Создать календарно-тематическую программу</CardTitle><CardDescription>Введите темы по одной на строку. Даты занятий назначатся последовательно от указанной даты.</CardDescription></CardHeader>
      <CardContent><form onSubmit={(event) => void createPlan(event)} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold">Предмет<input required maxLength={120} className="h-10 rounded-lg border border-border bg-surface px-3 text-sm" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></label>
        <label className="grid gap-1 text-xs font-semibold">Класс<input required maxLength={20} className="h-10 rounded-lg border border-border bg-surface px-3 text-sm" placeholder="7А" value={form.className} onChange={(event) => setForm({ ...form, className: event.target.value })} /></label>
        <label className="grid gap-1 text-xs font-semibold">Учебный год<input required pattern="\d{4}-\d{4}" className="h-10 rounded-lg border border-border bg-surface px-3 text-sm" placeholder="2026-2027" value={form.academicYear} onChange={(event) => setForm({ ...form, academicYear: event.target.value })} /></label>
        <label className="grid gap-1 text-xs font-semibold">Дата первого занятия<input type="date" className="h-10 rounded-lg border border-border bg-surface px-3 text-sm" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
        <label className="grid gap-1 text-xs font-semibold sm:col-span-2">Темы уроков<textarea required rows={5} maxLength={30000} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" placeholder={"Тема первого урока\nТема второго урока"} value={form.topics} onChange={(event) => setForm({ ...form, topics: event.target.value })} /></label>
        <div className="flex items-center gap-3 sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Сохраняю…" : "Сохранить программу"}</Button>{notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}</div>
      </form></CardContent>
    </Card>

    {plans.length === 0 ? <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">Учебных программ пока нет. Создайте первую выше.</CardContent></Card> : plans.map((plan) => {
      const completed = plan.lessons.filter((lesson) => lesson.status === "completed").length;
      const progress = plan.lessons.length ? Math.round((completed / plan.lessons.length) * 100) : 0;
      return <Card key={plan.id}>
        <CardHeader className="pb-2"><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-base">{plan.subject} — {plan.class_name}</CardTitle><CardDescription>{plan.academic_year} · {plan.total_hours} уроков</CardDescription></div><span className="text-xl font-bold">{progress}%</span></div></CardHeader>
        <CardContent><div className="h-2.5 overflow-hidden rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div>
          <ul className="mt-3 space-y-2">{plan.lessons.map((lesson) => <li key={lesson.number} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"><span className="min-w-0"><span className="mr-2 text-muted-foreground">{lesson.number}.</span>{lesson.topic}<span className="ml-2 text-xs text-muted-foreground">{lesson.planned_date || "Дата не задана"}</span></span><select aria-label={`Статус урока ${lesson.number}`} disabled={busy} value={lesson.status} onChange={(event) => void setStatus(plan.id, lesson.number, event.target.value as Lesson["status"])} className="h-9 rounded-lg border border-border bg-surface px-2 text-xs">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></li>)}</ul>
        </CardContent>
      </Card>;
    })}
  </div>;
}
