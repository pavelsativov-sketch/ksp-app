"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Teacher = { id: string; name: string; subject?: string };
const criteria = ["Планирование урока", "Содержание и достоверность", "Активность учащихся", "Оценивание и обратная связь", "Дифференциация и поддержка"];

export function VskRecorder({ schoolId, teachers }: { schoolId: string; teachers: Teacher[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const scores = criteria.map((criterion, i) => ({ criterion, score: Number(form.get(`score-${i}`)), max_score: 5 }));
    const overall = Math.round(scores.reduce((sum, item) => sum + item.score, 0) / scores.length * 20);
    const response = await fetch(`/api/school/${schoolId}/vsk`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teacher_id: form.get("teacher"), teacher_name: teachers.find(t => t.id === form.get("teacher"))?.name, subject: form.get("subject"), class_name: form.get("class"), date: form.get("date"), direction: "Посещение урока", checklist: scores, overall_score: overall, findings: form.get("findings"), recommendations: form.get("recommendations"), status: "completed" }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error ?? "Не удалось сохранить проверку"); setBusy(false); return; }
    router.refresh(); event.currentTarget.reset(); setBusy(false);
  }
  return <Card className="mb-6"><CardHeader><CardTitle className="text-base">Новая проверка урока</CardTitle></CardHeader><CardContent>
    {teachers.length === 0 ? <p className="text-sm text-muted-foreground">Добавьте педагогов в раздел «Сотрудники», чтобы начать проверку.</p> : <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Педагог<select name="teacher" required className="mt-1 w-full rounded-md border bg-background p-2">{teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label className="text-sm">Предмет<input name="subject" required maxLength={200} className="mt-1 w-full rounded-md border bg-background p-2" /></label><label className="text-sm">Класс<input name="class" required maxLength={50} className="mt-1 w-full rounded-md border bg-background p-2" /></label><label className="text-sm">Дата<input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-md border bg-background p-2" /></label></div>
      <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Чек-лист (оценка от 0 до 5)</legend>{criteria.map((criterion, i) => <label key={criterion} className="flex items-center justify-between gap-3 text-sm"><span>{criterion}</span><select name={`score-${i}`} defaultValue="3" className="rounded-md border bg-background p-1.5">{[0,1,2,3,4,5].map(n => <option key={n}>{n}</option>)}</select></label>)}</fieldset>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Выводы<textarea name="findings" maxLength={2000} rows={3} className="mt-1 w-full rounded-md border bg-background p-2" /></label><label className="text-sm">Рекомендации<textarea name="recommendations" maxLength={2000} rows={3} className="mt-1 w-full rounded-md border bg-background p-2" /></label></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy}>{busy ? "Сохраняю…" : "Сохранить проверку"}</Button>
    </form>}</CardContent></Card>;
}
