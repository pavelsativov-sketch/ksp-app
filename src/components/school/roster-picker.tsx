"use client";

import { useEffect, useState } from "react";
import { Database } from "lucide-react";
import type { JournalState, JournalStudentView } from "@/lib/journal";

interface RosterPickerProps {
  mode: "student" | "class";
  locale?: "ru" | "kk";
  onSelectStudent?: (student: JournalStudentView, summaryText: string) => void;
  onSelectClass?: (className: string, classScores: number[], summaryText: string) => void;
}

/**
 * Компактный выбор ученика или класса напрямую из Единой базы и Электронного журнала учителя.
 * Подгружает данные только в браузере (useEffect), не нарушая SSR-гидратацию.
 */
export function RosterPicker({
  mode,
  locale = "ru",
  onSelectStudent,
  onSelectClass,
}: RosterPickerProps) {
  const [state, setState] = useState<JournalState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/journal", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<JournalState>) : null))
      .then((data) => {
        if (!cancelled && data) setState(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state || state.students.length === 0) return null;

  if (mode === "student") {
    return (
      <div className="rounded-lg border border-primary/25 bg-primary/5 p-2.5 text-xs">
        <label className="flex items-center gap-1.5 font-semibold text-primary">
          <Database className="size-3.5" />
          {locale === "kk"
            ? "Электрондық журнал базасынан оқушыны таңдау:"
            : "Подставить ученика из Электронного журнала:"}
        </label>
        <select
          defaultValue=""
          onChange={(e) => {
            const st = state.students.find((s) => s.id === e.target.value);
            if (!st || !onSelectStudent) return;
            const avgPart =
              st.averageScore !== null
                ? locale === "kk"
                  ? `ҚБ орташа балы: ${st.averageScore}/10 (сапа: ${st.qualityPercent ?? 0}%).`
                  : `Средний балл по электронному журналу ФО: ${st.averageScore} из 10 (качество: ${st.qualityPercent ?? 0}%).`
                : "";
            const absTotal = st.excusedCount + st.unexcusedCount + st.sickCount;
            const absPart =
              absTotal > 0
                ? locale === "kk"
                  ? ` Босатылған сабақтар: барлығы ${absTotal} (дәлелді: ${st.excusedCount}, дәлелсіз: ${st.unexcusedCount}, ауруына байланысты: ${st.sickCount}).`
                  : ` Пропуски уроков: всего ${absTotal} (уважительных: ${st.excusedCount}, неуважительных: ${st.unexcusedCount}, по болезни: ${st.sickCount}).`
                : "";
            onSelectStudent(st, `${avgPart}${absPart}`.trim());
          }}
          className="mt-1.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
        >
          <option value="">
            {locale === "kk" ? "— Оқушыны таңдаңыз —" : "— Выберите ученика из базы —"}
          </option>
          {state.students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName} ({s.className}
              {s.averageScore !== null ? ` · ср. ${s.averageScore}/10` : ""})
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-2.5 text-xs">
      <label className="flex items-center gap-1.5 font-semibold text-primary">
        <Database className="size-3.5" />
        {locale === "kk"
          ? "Электрондық журналдан сынып деректерін жүктеу:"
          : "Подставить данные класса из Электронного журнала:"}
      </label>
      <select
        defaultValue=""
        onChange={(e) => {
          const cls = e.target.value;
          if (!cls || !onSelectClass) return;
          const clsStudents = state.students.filter((s) => s.className === cls);
          const avgScores = clsStudents
            .map((s) => (s.averageScore !== null ? Math.round(s.averageScore) : null))
            .filter((n): n is number => n !== null);
          const totalAbs = clsStudents.reduce(
            (acc, s) => acc + s.excusedCount + s.unexcusedCount + s.sickCount,
            0,
          );
          const classAvg =
            avgScores.length > 0
              ? (avgScores.reduce((a, b) => a + b, 0) / avgScores.length).toFixed(1)
              : "—";
          const summary =
            locale === "kk"
              ? `Сыныпта ${clsStudents.length} оқушы, журнал бойынша орташа балл: ${classAvg}/10, барлық босатулар: ${totalAbs}.`
              : `В классе ${clsStudents.length} уч., средний балл ФО по журналу: ${classAvg}/10, всего пропусков: ${totalAbs}.`;
          onSelectClass(cls, avgScores, summary);
        }}
        className="mt-1.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
      >
        <option value="">
          {locale === "kk" ? "— Сыныпты таңдаңыз —" : "— Выберите класс из журнала —"}
        </option>
        {state.classes.map((cls) => (
          <option key={cls} value={cls}>
            {cls} ({state.students.filter((s) => s.className === cls).length})
          </option>
        ))}
      </select>
    </div>
  );
}
