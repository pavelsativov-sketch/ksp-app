"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Loader2, Pencil, Plus, RotateCcw, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Student {
  _id: string;
  full_name: string;
  class_name: string;
  class_grade: number;
  gender: "M" | "F";
  status: string;
}

/** Ученики школы: реальный список + добавление через POST /api/school/[id]/students. */
export function StudentsClient({ schoolId }: { schoolId: string }) {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [classFilter, setClassFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", class_name: "", class_grade: "7", gender: "M" });
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", class_name: "", class_grade: "", gender: "M" as "M" | "F", status: "active" });
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Первый statement — await: все setState происходят уже асинхронно,
    // иначе react-hooks/set-state-in-effect ругается на вызов из эффекта.
    try {
      const params = new URLSearchParams();
      if (classFilter) params.set("class", classFilter);
      if (includeInactive) params.set("includeInactive", "true");
      const qs = params.size ? `?${params}` : "";
      const res = await fetch(`/api/school/${schoolId}/students${qs}`, { cache: "no-store" });
      const data = (await res.json()) as { students?: Student[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");
      setStudents(data.students ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      setStudents([]);
    }
  }, [schoolId, classFilter, includeInactive]);

  useEffect(() => {
    // Подгрузка в асинхронном колбэке: все setState — уже вне синхронной
    // фазы эффекта (см. react-hooks/set-state-in-effect).
    void (async () => { await load(); })();
  }, [load]);

  async function addStudent() {
    if (adding) return;
    setNotice(null);
    setAdding(true);
    try {
      const res = await fetch(`/api/school/${schoolId}/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, class_grade: Number(form.class_grade) }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { setNotice(data.error ?? "Не удалось добавить"); return; }
      setForm({ full_name: "", class_name: form.class_name, class_grade: form.class_grade, gender: form.gender });
      setNotice("Ученик добавлен");
      void load();
    } catch {
      setNotice("Сеть недоступна");
    } finally {
      setAdding(false);
    }
  }

  async function saveStudent(studentId: string) {
    setSavingId(studentId); setNotice(null);
    try {
      const response = await fetch(`/api/school/${schoolId}/students/${studentId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editForm, class_grade: Number(editForm.class_grade) }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось сохранить изменения");
      setEditing(null); setNotice("Данные ученика сохранены"); await load();
    } catch (e) { setNotice(e instanceof Error ? e.message : "Ошибка сохранения"); }
    finally { setSavingId(null); }
  }

  async function setStudentStatus(student: Student) {
      const active = !student.status || student.status === "active";
      const status = active ? "transferred" : "active";
    setSavingId(student._id); setNotice(null);
    try {
      const response = await fetch(`/api/school/${schoolId}/students/${student._id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: student.full_name, class_name: student.class_name, class_grade: student.class_grade, gender: student.gender, status }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось изменить статус");
      await load();
    } catch (e) { setNotice(e instanceof Error ? e.message : "Ошибка сохранения"); }
    finally { setSavingId(null); }
  }

  const classes = [...new Set((students ?? []).map((s) => s.class_name))].sort();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <header className="mb-6">
        <p className="editorial-kicker">Контингент</p>
        <h1 className="editorial-display mt-1 text-3xl">Ученики</h1>
      </header>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <form
        className="mb-5 grid gap-2 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[1fr_90px_80px_90px_auto]"
        onSubmit={(e) => { e.preventDefault(); void addStudent(); }}
      >
        <div className="space-y-1"><Label className="text-xs text-muted-foreground">ФИО</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Ахметов Азамат" required minLength={2} /></div>
        <div className="space-y-1"><Label className="text-xs text-muted-foreground">Класс</Label><Input value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })} placeholder="7А" required /></div>
        <div className="space-y-1"><Label className="text-xs text-muted-foreground">Параллель</Label><Input type="number" min={1} max={12} value={form.class_grade} onChange={(e) => setForm({ ...form, class_grade: e.target.value })} required /></div>
        <div className="space-y-1"><Label className="text-xs text-muted-foreground">Пол</Label>
          <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="M">М</option><option value="F">Ж</option>
          </select>
        </div>
        <div className="flex items-end"><Button type="submit" disabled={adding || !form.full_name || !form.class_name}>{adding ? <Loader2 className="animate-spin" /> : <UserPlus />} Добавить</Button></div>
      </form>
      {notice && <p className="mb-3 text-sm text-muted-foreground">{notice}</p>}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setClassFilter("")} aria-pressed={classFilter === ""} className={`rounded-full border px-3 py-1 text-xs ${classFilter === "" ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground"}`}>Все</button>
        {classes.map((c) => (
          <button key={c} type="button" onClick={() => setClassFilter(c)} aria-pressed={classFilter === c} className={`rounded-full border px-3 py-1 text-xs ${classFilter === c ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground"}`}>{c}</button>
        ))}
        <button type="button" onClick={() => setIncludeInactive((value) => !value)} aria-pressed={includeInactive} className={`rounded-full border px-3 py-1 text-xs ${includeInactive ? "border-amber-500 bg-amber-500/10 text-amber-700" : "border-border text-muted-foreground"}`}>{includeInactive ? "Архив включён" : "Показать архив"}</button>
        <span className="ml-auto text-xs text-muted-foreground">{students?.length ?? 0} чел.</span>
      </div>

      {students === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Загрузка…</p>
      ) : students.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground"><Plus className="mx-auto mb-2 size-6" /> Учеников пока нет — добавьте первого с помощью формы выше.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {students.map((s) => (
            <li key={s._id} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
              {editing === s._id ? <div className="grid gap-2 sm:grid-cols-[1fr_70px_70px_auto]"><Input aria-label="ФИО" value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })} /><Input aria-label="Класс" value={editForm.class_name} onChange={e => setEditForm({ ...editForm, class_name: e.target.value })} /><Input aria-label="Параллель" type="number" min={1} max={12} value={editForm.class_grade} onChange={e => setEditForm({ ...editForm, class_grade: e.target.value })} /><div className="flex gap-1"><select aria-label="Пол" value={editForm.gender} onChange={e => setEditForm({ ...editForm, gender: e.target.value as "M" | "F" })} className="rounded-md border bg-background px-2"><option value="M">М</option><option value="F">Ж</option></select><Button type="button" disabled={savingId === s._id} onClick={() => void saveStudent(s._id)}>Сохранить</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}>Отмена</Button></div></div> : <div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 truncate">{s.full_name}</span><span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{s.class_name} · {s.gender === "M" ? "М" : "Ж"}{s.status !== "active" && s.status ? " · архив" : ""}</span><div className="ml-auto flex gap-1"><Button type="button" variant="outline" size="sm" onClick={() => { setEditing(s._id); setEditForm({ full_name: s.full_name, class_name: s.class_name, class_grade: String(s.class_grade), gender: s.gender, status: s.status || "active" }); }}><Pencil className="size-3.5" /><span className="sr-only">Изменить {s.full_name}</span></Button><Button type="button" variant="outline" size="sm" disabled={savingId === s._id} onClick={() => void setStudentStatus(s)}>{!s.status || s.status === "active" ? <Archive className="size-3.5" /> : <RotateCcw className="size-3.5" />}<span className="sr-only">{!s.status || s.status === "active" ? "Перевести в архив" : "Восстановить"}</span></Button></div></div>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
