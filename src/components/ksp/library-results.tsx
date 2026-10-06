import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlanListItem } from "@/components/ksp/plans-filter";
import { LIBRARY_PAGE_SIZE, LIBRARY_QUERY_MAX, libraryHref, type LibraryQuery } from "@/lib/library-query";
import { formatDate } from "@/lib/utils";

interface Props {
  query: LibraryQuery;
  subjects: Array<{ id: string; name_ru: string }>;
  plans: PlanListItem[];
  total: number;
  page: number;
  pages: number;
}
const selectClass = "mt-1.5 block h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary";

export function LibraryResults({ query, subjects, plans, total, page, pages }: Props) {
  const active = Boolean(query.q || query.subject || query.grade || query.quarter || query.language || query.dateFrom || query.dateTo);
  const unknownSubject = query.subject && !subjects.some((s) => s.id === query.subject);
  return <div className="space-y-6">
    <form key={libraryHref(query)} action="/library" method="get" role="search" aria-label="Поиск в библиотеке" className="rounded-3xl border border-border bg-surface p-4">
      <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2"><label htmlFor="library-q" className="text-sm font-semibold">Поиск планов</label><Input id="library-q" name="q" defaultValue={query.q} maxLength={LIBRARY_QUERY_MAX} placeholder="Название, тема, содержание, предмет…" className="mt-1.5" /></div>
        <div><label htmlFor="library-subject" className="text-sm font-semibold">Предмет</label><select id="library-subject" name="subject" defaultValue={query.subject} className={selectClass}><option value="">Все предметы</option>{unknownSubject && <option value={query.subject}>Неизвестный предмет</option>}{subjects.map((s) => <option key={s.id} value={s.id}>{s.name_ru}</option>)}</select></div>
        <div><label htmlFor="library-grade" className="text-sm font-semibold">Класс</label><select id="library-grade" name="grade" defaultValue={query.grade} className={selectClass}><option value="">Все классы</option>{Array.from({ length: 11 }, (_, i) => i + 1).map((grade) => <option key={grade} value={grade}>{grade} класс</option>)}</select></div>
        <div><label htmlFor="library-quarter" className="text-sm font-semibold">Четверть</label><select id="library-quarter" name="quarter" defaultValue={query.quarter} className={selectClass}><option value="">Все четверти</option>{[1, 2, 3, 4].map((q) => <option key={q} value={q}>{q} четверть</option>)}<option value="none">Без четверти</option></select></div>
        <div><label htmlFor="library-language" className="text-sm font-semibold">Язык</label><select id="library-language" name="language" defaultValue={query.language} className={selectClass}><option value="">Все языки</option><option value="ru">Русский</option><option value="kz">Қазақша</option></select></div>
        <div><label htmlFor="library-dateFrom" className="text-sm font-semibold">Дата от</label><Input id="library-dateFrom" name="dateFrom" type="date" defaultValue={query.dateFrom} className="mt-1.5" /></div>
        <div><label htmlFor="library-dateTo" className="text-sm font-semibold">Дата до</label><Input id="library-dateTo" name="dateTo" type="date" defaultValue={query.dateTo} className="mt-1.5" /></div>
        <div><label htmlFor="library-sort" className="text-sm font-semibold">Сортировка</label><select id="library-sort" name="sort" defaultValue={query.sort} className={selectClass}><option value="newest">Сначала новые</option><option value="title">По названию</option><option value="popularity">По популярности (лайки)</option></select></div>
        <div className="flex flex-wrap gap-2"><Button type="submit">Найти</Button><Button asChild variant="ghost"><Link href="/library">Сбросить</Link></Button></div>
      </div>
    </form>
    <p role="status" aria-live="polite" className="font-mono text-xs text-muted-foreground">НАЙДЕНО {total} · ПОКАЗАНО {total ? (page - 1) * LIBRARY_PAGE_SIZE + 1 : 0}–{(page - 1) * LIBRARY_PAGE_SIZE + plans.length}</p>
    {plans.length === 0 ? <div className="rounded-3xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center text-sm text-muted-foreground">{active ? "Ничего не найдено. Измените запрос или сбросьте фильтры." : "Пока нет публичных КСП. Опубликуйте свой первый план, чтобы поделиться с коллегами."}</div> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{plans.map((p) => <article key={p.id} className="flex min-h-60 flex-col rounded-3xl border border-border bg-surface p-6">
      <p className="text-xs font-semibold text-cyan-foreground">{p.subject_name ?? "Без предмета"} · {p.grade} класс{p.quarter ? ` · ${p.quarter} четверть` : ""}</p>
      <h2 className="mt-5 text-xl font-bold"><Link href={`/plans/${p.id}`} className="hover:text-primary hover:underline">{p.title}</Link></h2>
      <p className="mt-2 mb-4 line-clamp-2 text-sm text-muted-foreground">{p.topic || "Тема урока пока не указана."}</p>
      <div className="mt-auto flex justify-between border-t border-border pt-4 text-xs text-muted-foreground"><span>Обновлён {formatDate(p.updated_at)}</span><span aria-label={`Лайков: ${p.likes ?? 0}`}>Лайки: {p.likes ?? 0}</span></div>
    </article>)}</div>}
    {pages > 1 && <nav aria-label="Страницы библиотеки" className="flex flex-wrap items-center justify-center gap-4">
      {page > 1 && <Button asChild variant="outline"><Link href={libraryHref(query, page - 1)} rel="prev">Предыдущая</Link></Button>}
      <span aria-current="page" className="text-sm">Страница {page} из {pages}</span>
      {page < pages && <Button asChild variant="outline"><Link href={libraryHref(query, page + 1)} rel="next">Следующая</Link></Button>}
    </nav>}
  </div>;
}
