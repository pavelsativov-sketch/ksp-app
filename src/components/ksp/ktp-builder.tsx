"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveDraftAction } from "@/app/actions/plans";
import { emptyKsp } from "@/lib/types/ksp";
import { MAX_KTP_TOPICS } from "@/lib/ktp";

const COPY = {
  ru: {
    title: "Календарно-тематический план",
    lead: "Черновик для редактирования в Word, не утверждённая учебная программа. Темы — по одной в строке. Часы можно задать прямо в строке: «Дроби · 2 ч.», конкретную дату — «Дроби | 2026-09-01». Цели подбираются из ГОСО по названию темы, проверьте их. На сервере КТП не сохраняется — скачайте результат.",
    card: "Календарный план на четверть: темы, часы, даты и цели ГОСО, в Word.",
    perWeekLabel: "Уроков в неделю",
    topicsLabel: "Темы уроков — каждая с новой строки",
    tooMany: (have: number, max: number) => `Тем ${have}, а максимум ${max}. Уберите лишние строки или разбейте план на четверти.`,
    dateLabel: "Дата первого урока (необязательно)",
    build: "Сформировать таблицу КТП",
    building: "Создание КТП…",
    hide: "Скрыть КТП",
    show: "Создать КТП",
    columns: ["№", "Тема", "Часы", "Дата", "Цели обучения"],
    emptyObjectives: "Заполните по учебной программе",
    caption: "Черновик календарно-тематического плана",
    download: "Скачать КТП в Word",
    draftPlans: (n: number) => `Создать черновики уроков (${n})`,
    proNotice: "Календарно-тематический план — фича тарифа Pro.",
    upgrade: "Улучшить до Pro",
    missingObjectives: "Для некоторых тем цели в ГОСО не нашлись: заполните их по учебной программе.",
  },
  kz: {
    title: "Күнтізбелік-тақырыптық жоспар",
    lead: "Жоба — Word редакциялауға арналған, ресми оқу бағдарламасы емес. Тақырыптардың бірін бір жолға жазыңыз. Сағат санын жол соңындағы «Дробь · 2 сағ.» белгісімен, нақты күнді «Дробь | 2026-09-01» түрімен бере аласыз. Мақсаттар тақырып атауы бойынша МЖМБС-тан таңдалады, оларды тексеріңіз. Серверде КТЖ сақталмайды — нәтижені жүктеп алыңыз.",
    card: "Тоқсанға күнтізбелік жоспар: тақырыптар, сағаттар, күндер және МЖМБС мақсаттары, Word форматында.",
    perWeekLabel: "Аптасына сабақ саны",
    topicsLabel: "Сабақ тақырыптары — әр жолға бір",
    tooMany: (have: number, max: number) => `Тақырып ${have}, ең көбі ${max}. Артық жолдарды алыңыз немесе жоспарды тоқсандарға бөліңіз.`,
    dateLabel: "Бірінші сабақтың күні (қалаулы)",
    build: "КТЖ кестесін құру",
    building: "КТЖ жасалуда…",
    hide: "КТЖ-ты жасыру",
    show: "КТЖ жасау",
    columns: ["№", "Тақырып", "Сағат", "Күні", "Оқу мақсаттары"],
    emptyObjectives: "Оқу бағдарламасы бойынша толтырыңыз",
    caption: "Күнтізбелік-тақырыптық жоспар жобасы",
    download: "КТЖ-ды Word форматында жүктеу",
    draftPlans: (n: number) => `Сабақ жобаларын жасау (${n})`,
    proNotice: "Күнтізбелік-тақырыптық жоспар — Pro жоспарының мүмкіндігі.",
    upgrade: "Pro-ға жаңарту",
    missingObjectives: "Кейбір тақырыптарға МЖМБС мақсаттары табылмады: оларды оқу бағдарламасы бойынша толтырыңыз.",
  },
} as const;

type KtpResult = {
  ktp: {
    title: string;
    rows: Array<{ number: number; topic: string; hours: number; date: string; objectives: string }>;
  };
  docxBase64?: string;
};

export function KtpBuilder({ planId, topic, isPro, grade, subjectId, language }: {
  planId: string;
  topic: string;
  isPro: boolean;
  grade: number;
  subjectId: string | null;
  language: "ru" | "kz";
}) {
  const copy = COPY[language] ?? COPY.ru;
  const [open, setOpen] = useState(false);
  const [topics, setTopics] = useState(topic);
  const [startDate, setStartDate] = useState("");
  const [lessonsPerWeek, setLessonsPerWeek] = useState(1);
  const [result, setResult] = useState<KtpResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<{ created: number; total: number; done: boolean; failed: number } | null>(null);

  const topicLines = topics.split("\n").map((t) => t.trim()).filter(Boolean);
  const tooManyTopics = topicLines.length > MAX_KTP_TOPICS;

  async function generate() {
    // Проверка до запроса: лимит проверялся только на сервере, и учитель
    // вписывал 50 тем, чтобы получить отказ и потерять введённый текст.
    if (tooManyTopics) {
      setError(copy.tooMany(topicLines.length, MAX_KTP_TOPICS));
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/ktp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, topics: topicLines, lessonsPerWeek, ...(startDate ? { startDate } : {}) }),
      });
      const data = await response.json();
      if (!response.ok || !data.ktp) throw new Error(data.error || "Не удалось создать КТП");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать КТП");
    } finally {
      setLoading(false);
    }
  }

  function download() {
    if (!result?.docxBase64) return;
    // Название файла на языке плана: казахский учитель получал файл
    // с русским именем и путал его с чужим документом.
    const bytes = Uint8Array.from(atob(result.docxBase64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = language === "kz" ? "КТЖ — жоба.docx" : "КТП — черновик.docx";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Пакетное создание черновиков КСП по строкам КТП (без траты AI-квоты). */
  async function createDrafts() {
    if (!result || drafts?.done === false) return;
    const rows = result.ktp.rows;
    setDrafts({ created: 0, total: rows.length, done: false, failed: 0 });
    let created = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const res = await saveDraftAction({
          title: row.topic,
          subject_id: subjectId,
          grade,
          quarter: null,
          section: null,
          visibility: "private",
          language,
          content: { ...emptyKsp(), topic: row.topic },
        });
        if ("error" in res) failed += 1;
        else created += 1;
      } catch {
        failed += 1;
      }
      setDrafts({ created, total: rows.length, done: false, failed });
    }
    setDrafts({ created, total: rows.length, done: true, failed });
  }

  return (
    <section className="no-print space-y-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold"><CalendarDays aria-hidden="true" className="size-5 text-primary" /> {copy.title}</h3>
          <p className="text-sm text-muted-foreground">{copy.card}</p>
        </div>
        <Button variant="outline" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="ktp-builder">
          {open ? copy.hide : copy.show}
        </Button>
      </div>
      {open && !isPro && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {copy.proNotice}{" "}
          <a href="/pricing" className="font-medium underline">{copy.upgrade}</a>
        </p>
      )}
      {open && isPro && <div id="ktp-builder" className="space-y-4">
        <p className="text-sm text-muted-foreground">{copy.lead}</p>
        <div className="space-y-2">
          <Label htmlFor="ktp-topics">{copy.topicsLabel} ({topicLines.length}/{MAX_KTP_TOPICS})</Label>
          <textarea id="ktp-topics" value={topics} onChange={(e) => setTopics(e.target.value)} disabled={loading} rows={5} maxLength={12040}
            className="w-full rounded-md border border-slate-300 bg-surface p-3 text-sm"
            aria-invalid={tooManyTopics} aria-describedby={tooManyTopics ? "ktp-topics-error" : undefined} />
          {tooManyTopics && (
            <p id="ktp-topics-error" role="alert" className="text-sm text-red-700">
              {copy.tooMany(topicLines.length, MAX_KTP_TOPICS)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="max-w-xs space-y-2">
            <Label htmlFor="ktp-date">{copy.dateLabel}</Label>
            <Input id="ktp-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={loading} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ktp-per-week">{copy.perWeekLabel}</Label>
            <select id="ktp-per-week" value={lessonsPerWeek} onChange={(e) => setLessonsPerWeek(Number(e.target.value))} disabled={loading}
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm">
              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <Button onClick={generate} disabled={loading || !topics.trim() || tooManyTopics}>
          {loading ? copy.building : copy.build}
        </Button>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {result && <div className="space-y-3" aria-live="polite">
          <h3 className="font-semibold">{result.ktp.title}</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{copy.caption}</caption>
              <thead><tr>{copy.columns.map((label) => <th key={label} scope="col" className="border border-slate-300 bg-slate-50 p-2">{label}</th>)}</tr></thead>
              <tbody>{result.ktp.rows.map((row) => <tr key={row.number}>
                <td className="border border-slate-300 p-2">{row.number}</td>
                <td className="min-w-40 border border-slate-300 p-2">{row.topic}</td>
                <td className="border border-slate-300 p-2">{row.hours}</td>
                <td className="border border-slate-300 p-2">{row.date || "—"}</td>
                <td className="min-w-40 whitespace-pre-line border border-slate-300 p-2">{row.objectives || copy.emptyObjectives}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {result.ktp.rows.some((row) => !row.objectives) && <p className="text-sm text-muted-foreground">{copy.missingObjectives}</p>}
          {result.docxBase64 && <Button onClick={download}>{copy.download}</Button>}
          {!drafts && (
            <Button variant="outline" onClick={() => void createDrafts()}>
              {copy.draftPlans(result.ktp.rows.length)}
            </Button>
          )}
          {drafts && !drafts.done && (
            <p role="status" className="text-sm text-slate-600">
              {language === "kz" ? "Жобалар жасалуда…" : "Создаём черновики…"} {drafts.created}/{drafts.total}
            </p>
          )}
          {drafts?.done && (
            <p role="status" className="text-sm text-emerald-700">
              {/* Фраза собирается одной строкой: разбитая на узлы, она
                  рассыпается при чтении с экрана и не находится поиском. */}
              {language === "kz"
                ? `Дайын: жоба ${drafts.created} / ${drafts.total}${drafts.failed > 0 ? ` (сәтсіз: ${drafts.failed})` : ""}.`
                : `Готово: черновиков ${drafts.created} из ${drafts.total}${drafts.failed > 0 ? ` (не удалось: ${drafts.failed})` : ""}.`}{" "}
              <Link href="/dashboard" className="font-medium underline">
                {language === "kz" ? "Мұрағатты ашу" : "Открыть архив"}
              </Link>
            </p>
          )}
        </div>}
      </div>}
    </section>
  );
}
