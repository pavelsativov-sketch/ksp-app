"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Student = { id: string; name: string; className: string };
type Status = "present" | "absent_excused" | "absent_unexcused" | "late";
const statuses: Array<{ value: Status; label: string }> = [
  { value: "present", label: "Присутствует" },
  { value: "late", label: "Опоздал" },
  { value: "absent_excused", label: "Нет, уважительная причина" },
  { value: "absent_unexcused", label: "Нет" },
];

function localDate() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

export function AttendanceRecorder({ schoolId, students }: { schoolId: string; students: Student[] }) {
  const router = useRouter();
  const classes = useMemo(() => [...new Set(students.map((student) => student.className))].sort(), [students]);
  const [className, setClassName] = useState(classes[0] ?? "");
  const [date, setDate] = useState(localDate);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const visible = students.filter((student) => student.className === className);

  async function save() {
    if (!className || visible.length === 0) return;
    setPending(true);
    setNotice("");
    try {
      const response = await fetch(`/api/school/${schoolId}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, className, marks: visible.map((student) => ({ studentId: student.id, status: marks[student.id] ?? "present" })) }),
      });
      const data = await response.json() as { error?: string; saved?: number };
      if (!response.ok) throw new Error(data.error ?? "Не удалось сохранить отметки.");
      setNotice(`Сохранено отметок: ${data.saved ?? visible.length}.`);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Сеть недоступна.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="mb-5">
      <CardHeader><CardTitle className="text-base">Отметить посещаемость</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {classes.length === 0 ? <p className="text-sm text-muted-foreground">Сначала добавьте учащихся в разделе «Ученики».</p> : <>
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1 text-xs font-semibold">Класс<select className="h-10 rounded-lg border border-border bg-surface px-3 text-sm" value={className} onChange={(event) => setClassName(event.target.value)}>{classes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="grid gap-1 text-xs font-semibold">Дата<input className="h-10 rounded-lg border border-border bg-surface px-3 text-sm" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          </div>
          <div className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {visible.map((student) => <div key={student.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <span className="text-sm font-medium">{student.name}</span>
              <select aria-label={`Посещаемость: ${student.name}`} className="h-9 max-w-full rounded-lg border border-border bg-surface px-2 text-sm" value={marks[student.id] ?? "present"} onChange={(event) => setMarks((previous) => ({ ...previous, [student.id]: event.target.value as Status }))}>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            </div>)}
          </div>
          <div className="flex flex-wrap items-center gap-3"><Button onClick={() => void save()} disabled={pending || !date}>{pending ? "Сохраняю…" : "Сохранить отметки"}</Button>{notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}</div>
        </>}
      </CardContent>
    </Card>
  );
}
