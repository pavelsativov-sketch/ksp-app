"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Check, Printer, Sparkles, Compass } from "lucide-react";
import { RosterPicker } from "@/components/school/roster-picker";
import { SchoolDocxButton } from "@/components/school/school-docx-button";
import { useUiLocale } from "@/components/i18n/use-ui-locale";

export default function IomPage() {
  const { locale } = useUiLocale();
  const isKk = locale === "kk";

  const [studentName, setStudentName] = useState("Сериков Нурлан");
  const [subject, setSubject] = useState("Математика");
  const [grade, setGrade] = useState("6 класс");
  const [trackType, setTrackType] = useState("Ликвидация пробелов в знаниях (слабоуспевающий)");
  const [gaps, setGaps] = useState(
    "Действия с обыкновенными и десятичными дробями, решение уравнений и текстовых задач на движение",
  );
  const [period, setPeriod] = useState("1 месяц (4 недели)");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/school/ai-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "iom",
          params: {
            studentName,
            subject,
            grade,
            trackType,
            gaps,
            period,
            language: isKk ? "kz" : "ru",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка генерации");
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сформировать маршрут");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6">
      <header>
        <p className="editorial-kicker text-warning">
          {isKk ? "Саралап оқыту" : "Дифференцированное обучение"}
        </p>
        <h1 className="editorial-display mt-1 text-3xl font-bold">
          {isKk
            ? "Жеке білім беру маршруттары (ЖБМ)"
            : "Индивидуальные образовательные маршруты (ИОМ)"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isKk
            ? "Оқушыны базадан таңдаңыз — ЖИ білімдегі олқылықтарды жоюдың апталық жоспарын, дидактикалық тапсырмалар мен бақылау критерийлерін құрастырады (Word форматымен)."
            : "Пошаговые программы работы со слабоуспевающими или одарёнными учащимися: диагностика пробелов, понедельный план, дидактические задания и выгрузка в Word."}
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-12">
        <Card className="md:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">
              {isKk ? "Маршрут параметрлері" : "Параметры маршрута"}
            </CardTitle>
            <CardDescription>
              {isKk ? "Пәнді, тақырыптарды және мерзімін көрсетіңіз" : "Укажите предмет, пробелы и сроки"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <RosterPicker
              mode="student"
              locale={locale}
              onSelectStudent={(st, summaryText) => {
                setStudentName(st.fullName);
                setGrade(st.className);
                if (summaryText) {
                  setGaps((prev) => `${summaryText}\n${prev}`.slice(0, 600));
                }
              }}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  {isKk ? "Оқушы" : "Учащийся"}
                </label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-warning/40"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  {isKk ? "Сынып" : "Класс"}
                </label>
                <input
                  type="text"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-warning/40"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  {isKk ? "Пән" : "Предмет"}
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-warning/40"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  {isKk ? "Іске асыру мерзімі" : "Срок реализации"}
                </label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-2.5 py-2 text-sm outline-none focus:border-warning/40"
                >
                  <option value="2 недели (интенсив)">
                    {isKk ? "2 апта (қарқынды)" : "2 недели (интенсив)"}
                  </option>
                  <option value="1 месяц (4 недели)">
                    {isKk ? "1 ай (4 апта)" : "1 месяц (4 недели)"}
                  </option>
                  <option value="1 учебная четверть">
                    {isKk ? "1 тоқсан" : "1 четверть"}
                  </option>
                  <option value="Учебное полугодие">
                    {isKk ? "Жартыжылдық" : "Полугодие"}
                  </option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {isKk ? "Маршрут бағыты" : "Направленность маршрута"}
              </label>
              <select
                value={trackType}
                onChange={(e) => setTrackType(e.target.value)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:border-warning/40"
              >
                <option value="Ликвидация пробелов в знаниях (слабоуспевающий)">
                  {isKk
                    ? "Білімдегі олқылықтарды жою (үлгерімі төмен)"
                    : "Ликвидация пробелов в знаниях (слабоуспевающий)"}
                </option>
                <option value="Развитие одарённости и углублённая подготовка к олимпиадам">
                  {isKk
                    ? "Дарындылықты дамыту және олимпиадаға дайындық"
                    : "Развитие одарённости и олимпиадная подготовка"}
                </option>
                <option value="Подготовка к пересдаче суммативного оценивания (СОР/СОЧ)">
                  {isKk ? "БЖБ / ТЖБ-ға дайындық" : "Подготовка к пересдаче СОР / СОЧ"}
                </option>
                <option value="Индивидуальное сопровождение после длительного пропуска уроков">
                  {isKk
                    ? "Аурудан / сабақ босатудан кейінгі сүйемелдеу"
                    : "Сопровождение после болезни / пропуска занятий"}
                </option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {isKk ? "Қиындық тудыратын тақырыптар" : "Западающие темы / Выявленные затруднения"}
              </label>
              <textarea
                value={gaps}
                onChange={(e) => setGaps(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border bg-background p-2.5 text-xs outline-none focus:border-warning/40"
              />
            </div>

            <Button
              onClick={() => void handleGenerate()}
              disabled={loading || !studentName.trim()}
              className="w-full gap-2 bg-gradient-to-r from-warning to-warning font-semibold text-white shadow-lg hover:opacity-90"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {loading
                ? isKk
                  ? "Маршрут құрылуда..."
                  : "Формирую маршрут..."
                : isKk
                  ? "ЖБМ маршрутын құрастыру"
                  : "Сформировать маршрут ИОМ"}
            </Button>
            {error && <p className="text-xs text-rose-400">{error}</p>}
          </CardContent>
        </Card>

        <Card className="flex flex-col md:col-span-7">
          <CardHeader className="flex flex-wrap flex-row items-center justify-between gap-2 pb-3">
            <div>
              <CardTitle className="text-base">
                {isKk ? "Жеке білім беру маршруты (ЖБМ)" : "Индивидуальный маршрут (ИОМ)"}
              </CardTitle>
              <CardDescription>
                {isKk ? "Апталық жоспар және дидактикалық қадамдар" : "Понедельный план и дидактические шаги"}
              </CardDescription>
            </div>
            {result && (
              <div className="flex flex-wrap gap-1.5">
                <SchoolDocxButton
                  title={`${isKk ? "ЖБМ" : "ИОМ"} — ${studentName} (${subject})`}
                  subtitle={`${grade} · ${period}`}
                  content={result}
                  language={isKk ? "kz" : "ru"}
                />
                <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
                  {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                  {copied ? (isKk ? "Көшірілді" : "Скопировано") : isKk ? "Көшіру" : "Копировать"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="gap-1.5 text-xs"
                >
                  <Printer className="size-3.5" /> {isKk ? "Басып шығару" : "Печать"}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="flex-1">
            {!result && !loading && (
              <div className="grid h-80 place-items-center text-center text-muted-foreground">
                <div className="space-y-2">
                  <Compass className="mx-auto size-10 opacity-30" />
                  <p className="text-sm font-medium">
                    {isKk ? "Маршрут осында шығады" : "Маршрут появится здесь"}
                  </p>
                </div>
              </div>
            )}
            {loading && (
              <div className="grid h-80 place-items-center text-center text-muted-foreground">
                <Loader2 className="mx-auto size-8 animate-spin text-warning" />
              </div>
            )}
            {result && (
              <div className="max-h-[620px] overflow-y-auto rounded-xl border bg-muted/30 p-5 font-sans text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                {result}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
