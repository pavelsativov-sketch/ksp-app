"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, BookOpen } from "lucide-react";

interface SeriesNavProps {
  currentId: string;
  seriesTitle: string;
  plans: Array<{ id: string; title: string; series_position: number | null }>;
}

export function SeriesNav({ currentId, seriesTitle, plans }: SeriesNavProps) {
  if (plans.length === 0) return null;

  const idx = plans.findIndex((p) => p.id === currentId);
  const prev = idx > 0 ? plans[idx - 1] : null;
  const next = idx >= 0 && idx < plans.length - 1 ? plans[idx + 1] : null;
  const total = plans.length;
  const pos = idx >= 0 ? idx + 1 : null;

  return (
    <div className="flex items-center gap-2 flex-wrap text-sm">
      <BookOpen className="w-4 h-4 text-sky-600" />
      <span className="text-slate-700">
        Серия: <span className="font-medium text-slate-900">{seriesTitle}</span>
        {pos && (
          <span className="text-slate-500"> · урок {pos} из {total}</span>
        )}
      </span>
      <span className="mx-1 text-slate-300">|</span>
      {prev ? (
        <Link
          href={`/plans/${prev.id}`}
          className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 hover:underline"
          title={prev.title}
        >
          <ChevronLeft className="w-4 h-4" />
          {prev.series_position ? `Урок ${prev.series_position}` : "Назад"}
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1 text-slate-300 cursor-not-allowed">
          <ChevronLeft className="w-4 h-4" />
          Назад
        </span>
      )}
      <span className="text-slate-300">·</span>
      {next ? (
        <Link
          href={`/plans/${next.id}`}
          className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 hover:underline"
          title={next.title}
        >
          {next.series_position ? `Урок ${next.series_position}` : "Далее"}
          <ChevronRight className="w-4 h-4" />
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1 text-slate-300 cursor-not-allowed">
          Далее
          <ChevronRight className="w-4 h-4" />
        </span>
      )}
    </div>
  );
}
