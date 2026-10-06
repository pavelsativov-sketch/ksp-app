"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Heart, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export interface PlanListItem { id: string; title: string; grade: number; subject_id: string | null; subject_name?: string | null; quarter?: number | null; class_id?: string | null; class_name?: string | null; updated_at: string; visibility?: "private" | "unlisted" | "public"; topic?: string | null; is_draft?: boolean; likes?: number; }
export interface PlansFilterProps { plans: PlanListItem[]; subjects: Array<{ id: string; name_ru: string }>; showVisibility?: boolean; showEditLink?: boolean; showLikes?: boolean; classes?: Array<{ id: string; name: string }>; emptyMessage: string; }
const ALL = "__all__";
const NO_CLASS = "__none__";
/** Клиентская пагинация: сколько карточек показывать сразу. */
const PAGE_SIZE = 24;

export function PlansFilter({ plans, subjects, showVisibility = false, showEditLink = false, showLikes = false, classes = [], emptyMessage }: PlansFilterProps) {
  const [q, setQ] = useState("");
  const [subjectId, setSubjectId] = useState(ALL);
  const [grade, setGrade] = useState(ALL);
  const [quarter, setQuarter] = useState(ALL);
  const [classId, setClassId] = useState(ALL);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return plans.filter((p) =>
      (subjectId === ALL || p.subject_id === subjectId) &&
      (grade === ALL || String(p.grade) === grade) &&
      (quarter === ALL || (quarter === "none" ? p.quarter == null : String(p.quarter) === quarter)) &&
      (classId === ALL || (classId === NO_CLASS ? !p.class_id : p.class_id === classId)) &&
      (!needle || `${p.title} ${p.topic ?? ""} ${p.subject_name ?? ""} ${p.class_name ?? ""}`.toLowerCase().includes(needle)));
  }, [plans, q, subjectId, grade, quarter, classId]);
  const availableSubjects = subjects.filter((s) => plans.some((p) => p.subject_id === s.id));
  const usedGrades = useMemo(() => Array.from(new Set(plans.map((p) => p.grade))).sort((a, b) => a - b), [plans]);
  // Показываем фильтр класса, только если он что-то сузит.
  const usedClasses = classes.filter((c) => plans.some((p) => p.class_id === c.id));
  const hasUnassigned = plans.some((p) => !p.class_id);
  const filtersActive = q.trim() !== "" || subjectId !== ALL || grade !== ALL || quarter !== ALL || classId !== ALL;
  const reset = () => { setQ(""); setSubjectId(ALL); setGrade(ALL); setQuarter(ALL); setClassId(ALL); };

  return <div className="space-y-5">
    <div className="rounded-3xl border border-border bg-surface p-4">
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_auto_auto_auto_auto] sm:items-end">
        <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Поиск</span><div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" /><Input aria-label="Поиск планов" className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название, тема или предмет" /></div></label>
        {availableSubjects.length > 0 && <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Предмет</span><Select value={subjectId} onValueChange={setSubjectId}><SelectTrigger className="min-w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Все предметы</SelectItem>{availableSubjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name_ru}</SelectItem>)}</SelectContent></Select></label>}
        {usedGrades.length > 0 && <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Класс</span><Select value={grade} onValueChange={setGrade}><SelectTrigger className="min-w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Все классы</SelectItem>{usedGrades.map((g) => <SelectItem key={g} value={String(g)}>{g} класс</SelectItem>)}</SelectContent></Select></label>}
        <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Четверть</span><Select value={quarter} onValueChange={setQuarter}><SelectTrigger className="min-w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Все четверти</SelectItem>{[1, 2, 3, 4].map((value) => <SelectItem key={value} value={String(value)}>{value} четверть</SelectItem>)}<SelectItem value="none">Без четверти</SelectItem></SelectContent></Select></label>
        {(usedClasses.length > 0 || hasUnassigned) && <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Класс/группа</span><Select value={classId} onValueChange={setClassId}><SelectTrigger className="min-w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Все классы</SelectItem>{usedClasses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}{hasUnassigned && <SelectItem value={NO_CLASS}>Без класса</SelectItem>}</SelectContent></Select></label>}
        {filtersActive && <Button type="button" variant="ghost" size="sm" onClick={reset}><X /> Сбросить</Button>}
      </div>
    </div>
    <p className="font-mono text-xs text-muted-foreground">ПОКАЗАНО {Math.min(filtered.length, visible)} ИЗ {filtered.length}</p>
    {filtered.length === 0 ? <div className="rounded-3xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center text-sm text-muted-foreground">{filtersActive ? "Ничего не найдено. Измените запрос или сбросьте фильтры." : emptyMessage}</div> : <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{filtered.slice(0, visible).map((p) => <article key={p.id} className="group flex min-h-[15.25rem] flex-col rounded-3xl border border-border bg-surface p-6 transition-[box-shadow,border-color] hover:shadow-card">
      <div className="flex items-start justify-between gap-3"><p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-cyan-foreground">{p.subject_name ?? "Без предмета"}{p.class_name ? ` · ${p.class_name}` : ""}</p><span className="font-mono text-xs text-muted-foreground">{p.grade} КЛ. {p.quarter ? `· ${p.quarter} ЧЕТ.` : ""}</span></div>
      <h2 className="mt-5 text-xl font-bold leading-6 tracking-[-0.025em]"><Link className="hover:text-primary hover:underline" href={`/plans/${p.id}`}>{p.title}</Link></h2>
      <p className="mt-2 min-h-11 text-sm leading-5 text-muted-foreground line-clamp-2">{p.topic || "Тема урока пока не указана."}</p>
      <div className="mt-auto flex items-end justify-between border-t border-border pt-4"><div className="text-xs text-muted-foreground"><p>{formatDate(p.updated_at)}</p>{showVisibility && p.visibility && <p className="mt-1 font-mono uppercase tracking-wide text-cyan-foreground">{p.is_draft ? "черновик" : p.visibility}</p>}{showLikes && (p.likes ?? 0) > 0 && <p className="mt-1 inline-flex items-center gap-1"><Heart className="size-3 text-primary" /> {p.likes}</p>}</div><div className="flex items-center gap-1"><Button asChild variant="ghost" size="sm"><Link href={`/plans/${p.id}`}>Открыть <ArrowUpRight /></Link></Button>{showEditLink && <Button asChild variant="ghost" size="sm"><Link href={`/plans/${p.id}/edit`}>Править</Link></Button>}</div></div>
    </article>)}</div>
      {filtered.length > visible && (
        <div className="text-center">
          <Button variant="outline" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
            Показать ещё ({filtered.length - visible})
          </Button>
        </div>
      )}
    </div>}
  </div>;
}
