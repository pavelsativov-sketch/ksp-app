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
  topic?: string | null;
}

export interface PlansFilterProps {
  plans: PlanListItem[];
  subjects: Array<{ id: string; name_ru: string }>;
  showVisibility?: boolean;
  showEditLink?: boolean;
  emptyMessage: string;
}

const ALL = "__all__";

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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return plans.filter((p) => {
      if (subjectId !== ALL && p.subject_id !== subjectId) return false;
      if (grade !== ALL && String(p.grade) !== grade) return false;
      if (quarter !== ALL) {
        if (quarter === "none") {
          if (p.quarter != null) return false;
        } else if (String(p.quarter) !== quarter) return false;
      }
      if (needle) {
        const hay =
          `${p.title} ${p.topic ?? ""} ${p.subject_name ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [plans, q, subjectId, grade, quarter]);

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
    q.trim() !== "" || subjectId !== ALL || grade !== ALL || quarter !== ALL;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center bg-slate-50 border border-slate-200 rounded-lg p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по названию или теме…"
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
            <Card key={p.id} className="hover:border-blue-400 transition-colors">
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
                      <span className="capitalize">{p.visibility}</span>
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
