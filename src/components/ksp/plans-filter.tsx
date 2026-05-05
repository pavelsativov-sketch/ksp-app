"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export interface PlanListItem {
  id: string;
  title: string;
  grade: number;
  subject_id: string | null;
  subject_name?: string | null;
  quarter?: number | null;
  updated_at: string;
  visibility?: "private" | "unlisted" | "public";
  language?: "ru" | "kz";
  topic?: string | null;
  /**
   * Pre-computed lower-cased haystack of plan content (title, topic, learning
   * objectives text, lesson objectives, teacher/student actions, etc.) used by
   * the in-page search box. The server builds this from `content` jsonb so we
   * don't ship the full plan payload to the client.
   */
  search_text?: string | null;
}

export interface PlansFilterProps {
  plans: PlanListItem[];
  subjects: Array<{ id: string; name_ru: string }>;
  showVisibility?: boolean;
  showEditLink?: boolean;
  emptyMessage: string;
}

const ALL = "__all__";

function VisibilityBadge({ value }: { value: "private" | "unlisted" | "public" }) {
  const map = {
    private: { label: "приватный", cls: "bg-slate-100 text-slate-600" },
    unlisted: { label: "по ссылке", cls: "bg-sky-100 text-sky-700" },
    public: { label: "публичный", cls: "bg-emerald-100 text-emerald-700" },
  } as const;
  const it = map[value];
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${it.cls}`}>
      {it.label}
    </span>
  );
}

export function PlansFilter({
  plans,
  subjects,
  showVisibility = false,
  showEditLink = false,
  emptyMessage,
}: PlansFilterProps) {
  const [q, setQ] = useState("");
  const [subjectId, setSubjectId] = useState<string>(ALL);
  const [grade, setGrade] = useState<string>(ALL);
  const [quarter, setQuarter] = useState<string>(ALL);
  const [language, setLanguage] = useState<string>(ALL);
  // Date range: ALL | "7" | "30" | "90" | "365" — days back from now.
  const [dateRange, setDateRange] = useState<string>(ALL);
  const [visibilityFilter, setVisibilityFilter] = useState<string>(ALL);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // Date.now() drift between renders is fine here — cutoff just shifts
    // the "recent" window by milliseconds.
    const cutoffMs =
      dateRange === ALL
        ? null
        // eslint-disable-next-line react-hooks/purity
        : Date.now() - Number(dateRange) * 86_400_000;
    return plans.filter((p) => {
      if (subjectId !== ALL && p.subject_id !== subjectId) return false;
      if (grade !== ALL && String(p.grade) !== grade) return false;
      if (quarter !== ALL) {
        if (quarter === "none") {
          if (p.quarter != null) return false;
        } else if (String(p.quarter) !== quarter) return false;
      }
      if (language !== ALL && p.language !== language) return false;
      if (
        visibilityFilter !== ALL &&
        showVisibility &&
        p.visibility !== visibilityFilter
      )
        return false;
      if (cutoffMs != null && new Date(p.updated_at).getTime() < cutoffMs)
        return false;
      if (needle) {
        const hay = (
          `${p.title} ${p.topic ?? ""} ${p.subject_name ?? ""} ${p.search_text ?? ""}`
        ).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [
    plans,
    q,
    subjectId,
    grade,
    quarter,
    language,
    visibilityFilter,
    showVisibility,
    dateRange,
  ]);

  const usedSubjectIds = useMemo(
    () =>
      new Set(
        plans
          .map((p) => p.subject_id)
          .filter((x): x is string => Boolean(x)),
      ),
    [plans],
  );
  const availableSubjects = subjects.filter((s) => usedSubjectIds.has(s.id));

  const usedGrades = useMemo(
    () => Array.from(new Set(plans.map((p) => p.grade))).sort((a, b) => a - b),
    [plans],
  );

  const filtersActive =
    q.trim() !== "" ||
    subjectId !== ALL ||
    grade !== ALL ||
    quarter !== ALL ||
    language !== ALL ||
    dateRange !== ALL ||
    visibilityFilter !== ALL;

  const hasMultipleLanguages = useMemo(
    () => new Set(plans.map((p) => p.language).filter(Boolean)).size > 1,
    [plans],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center bg-slate-50 border border-slate-200 rounded-lg p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по названию, теме, целям, ходу урока…"
            className="pl-8"
          />
        </div>
        {availableSubjects.length > 0 && (
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Все предметы</SelectItem>
              {availableSubjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name_ru}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {usedGrades.length > 0 && (
          <Select value={grade} onValueChange={setGrade}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Все классы</SelectItem>
              {usedGrades.map((g) => (
                <SelectItem key={g} value={String(g)}>
                  {g} класс
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={quarter} onValueChange={setQuarter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Все четверти</SelectItem>
            <SelectItem value="1">1 четверть</SelectItem>
            <SelectItem value="2">2 четверть</SelectItem>
            <SelectItem value="3">3 четверть</SelectItem>
            <SelectItem value="4">4 четверть</SelectItem>
            <SelectItem value="none">Без четверти</SelectItem>
          </SelectContent>
        </Select>
        {hasMultipleLanguages && (
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Любой язык</SelectItem>
              <SelectItem value="ru">Русский</SelectItem>
              <SelectItem value="kz">Қазақ</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Любые даты</SelectItem>
            <SelectItem value="7">За неделю</SelectItem>
            <SelectItem value="30">За месяц</SelectItem>
            <SelectItem value="90">За квартал</SelectItem>
            <SelectItem value="365">За год</SelectItem>
          </SelectContent>
        </Select>
        {showVisibility && (
          <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Любая видимость</SelectItem>
              <SelectItem value="private">Приватные</SelectItem>
              <SelectItem value="unlisted">По ссылке</SelectItem>
              <SelectItem value="public">Публичные</SelectItem>
            </SelectContent>
          </Select>
        )}
        {filtersActive && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              setSubjectId(ALL);
              setGrade(ALL);
              setQuarter(ALL);
              setLanguage(ALL);
              setDateRange(ALL);
              setVisibilityFilter(ALL);
            }}
          >
            <X className="w-4 h-4" /> Сброс
          </Button>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Найдено: {filtered.length} из {plans.length}
      </p>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500 text-sm">
            {filtersActive
              ? "Ничего не найдено. Сбросьте фильтры или уточните запрос."
              : emptyMessage}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <Card
              key={p.id}
              className="group hover:border-sky-400 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
            >
              <CardHeader>
                <CardTitle className="text-lg line-clamp-2">
                  <Link href={`/plans/${p.id}`} className="hover:underline">
                    {p.title}
                  </Link>
                </CardTitle>
                <CardDescription className="text-xs flex gap-2 items-center flex-wrap">
                  <span>{p.grade} класс</span>
                  {p.subject_name && (
                    <>
                      <span>•</span>
                      <span>{p.subject_name}</span>
                    </>
                  )}
                  {p.quarter != null && (
                    <>
                      <span>•</span>
                      <span>{p.quarter} четв.</span>
                    </>
                  )}
                  <span>•</span>
                  <span>{formatDate(p.updated_at)}</span>
                  {showVisibility && p.visibility && (
                    <>
                      <span>•</span>
                      <VisibilityBadge value={p.visibility} />
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {p.topic && (
                  <p className="text-sm text-slate-600 line-clamp-2">{p.topic}</p>
                )}
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/plans/${p.id}`}>Открыть</Link>
                  </Button>
                  {showEditLink && (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/plans/${p.id}/edit`}>Редактировать</Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
