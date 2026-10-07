"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Student = { id: string; name: string; className: string };

function localDate() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

export function GradeRecorder({ schoolId, students }: { schoolId: string; students: Student[] }) {
  const router = useRouter();
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [quarter, setQuarter] = useState("1");
  const [type, setType] = useState("current");
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("10");
  const [topic, setTopic] = useState("");
  const [date, setDate] = useState(localDate);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNotice("");
    try {
      const response = await fetch(`/api/school/${schoolId}/grades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, subject, quarter: Number(quarter), type, score: Number(score), maxScore: Number(maxScore), topic, date }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Не удалось сохранить оценку.");
      setNotice("Оценка сохранена.");
      setScore("");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Сеть недоступна.");
    } finally {
      setPending(false);
    }
  }

  return <Card className="mb-5">
    <CardHeader><CardTitle className="text-base">Добавить оценку</CardTitle></CardHeader>
    <CardContent>{students.length === 0 ? <p className="text-sm text-muted-foreground">Сначала добавьте учащихся в разделе «Ученики».</p> : <form onSubmit={(event) => void save(event)} className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-xs font-semibold">Учащийся<select required className="h-10 rounded-lg border border-border bg-surface px-3 text-sm" value={studentId} onChange={(event) => setStudentId(event.target.value)}>{students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.className}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-semibold">Предмет<input required maxLength={120} className="h-10 rounded-lg border border-border bg-surface px-3 text-sm" value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
      <label className="grid gap-1 text-xs font-semibold">Вид работы<select className="h-10 rounded-lg border border-border bg-surface px-3 text-sm" value={type} onChange={(event) => setType(event.target.value)}><option value="current">Текущая</option><option value="sor">СОР</option><option value="soch">СОЧ</option></select></label>
      <label className="grid gap-1 text-xs font-semibold">Четверть<select className="h-10 rounded-lg border border-border bg-surface px-3 text-sm" value={quarter} onChange={(event) => setQuarter(event.target.value)}>{[1, 2, 3, 4].map((item) => <option key={item}>{item}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-xs font-semibold">Балл<input required type="number" min="0" step="any" className="h-10 rounded-lg border border-border bg-surface px-3 text-sm" value={score} onChange={(event) => setScore(event.target.value)} /></label><label className="grid gap-1 text-xs font-semibold">Максимум<input required type="number" min="0.01" step="any" className="h-10 rounded-lg border border-border bg-surface px-3 text-sm" value={maxScore} onChange={(event) => setMaxScore(event.target.value)} /></label></div>
      <label className="grid gap-1 text-xs font-semibold">Дата<input required type="date" className="h-10 rounded-lg border border-border bg-surface px-3 text-sm" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label className="grid gap-1 text-xs font-semibold sm:col-span-2">Тема работы<input maxLength={200} className="h-10 rounded-lg border border-border bg-surface px-3 text-sm" value={topic} onChange={(event) => setTopic(event.target.value)} /></label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><Button type="submit" disabled={pending || !studentId}>{pending ? "Сохраняю…" : "Сохранить оценку"}</Button>{notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}</div>
    </form>}</CardContent>
  </Card>;
}
