"use client";

import React, { useState, useSyncExternalStore } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Check, Printer, Sparkles, FileSpreadsheet } from "lucide-react";
import { RosterPicker } from "@/components/school/roster-picker";
import { SchoolDocxButton } from "@/components/school/school-docx-button";

const DAY_TICK_MS = 30_000;

function subscribeDayTick(onChange: () => void) {
  const timer = setInterval(onChange, DAY_TICK_MS);
  return () => clearInterval(timer);
}

function getDayTick(): number {
  return Math.floor(Date.now() / DAY_TICK_MS);
}

export function VskSpravkaClient({ locale = "ru" }: { locale?: "ru" | "kk" } = {}) {
  const isKk = locale === "kk";
  const [inspectionType, setInspectionType] = useState("Посещение и анализ уроков педагогов");
  const [target, setTarget] = useState("Учителя естественно-математического цикла (5–9 классы)");
  const [inboxDate, setInboxDate] = useState<string | null>(null);
  const dateTick = useSyncExternalStore(
    subscribeDayTick,
    getDayTick,
    () => null,
  );
  const date = inboxDate ?? (dateTick === null ? "" : new Date().toLocaleDateString("ru-RU"));
  const [purpose, setPurpose] = useState(
    "Определение соответствия поурочного планирования требованиям ГОСО, эффективность использования формативного оценивания",
  );
  const [notes, setNotes] = useState(
    "Большинство педагогов используют критериальное оценивание. У двух молодых специалистов выявлены затруднения с дифференциацией заданий на этапе закрепления.",
  );

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
          tool: "vsk-spravka",
          params: {
            inspectionType,
            target,
            date,
            purpose,
            notes,
            language: isKk ? "kz" : "ru",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка генерации");
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сформировать справку ВШК");
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
    <div className="grid gap-6 md:grid-cols-12">
      <Card className="md:col-span-5">
        <CardHeader>
          <CardTitle className="text-base">
            {isKk ? "МІБ тексеру параметрлері" : "Параметры проверки ВШК"}
          </CardTitle>
          <CardDescription>
            {isKk ? "Аналитикалық анықтама үшін бастапқы деректер" : "Задайте вводные данные для аналитической справки"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <RosterPicker
            mode="class"
            locale={locale}
            onSelectClass={(cls, _scores, summaryText) => {
              setTarget(cls);
              if (summaryText) {
                setNotes((prev) => `${summaryText}\n${prev}`.slice(0, 700));
              }
            }}
          />

          <div>
            <label className="text-xs font-semibold text-muted-foreground">
              {isKk ? "Бақылау бағыты" : "Направление контроля"}
            </label>
            <select
              value={inspectionType}
              onChange={(e) => setInspectionType(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:border-rose-500"
            >
              <option value="Посещение и анализ уроков педагогов">
                {isKk ? "Педагогтардың сабақтарына қатысу және талдау" : "Посещение и анализ уроков педагогов"}
              </option>
              <option value="Проверка поурочных планов (КСП) и календарно-тематических планов (КТП)">
                {isKk ? "ҚМЖ және КТЖ жоспарларын тексеру" : "Проверка поурочных планов (КСП) и КТП"}
              </option>
              <option value="Контроль качества ведения рабочих тетрадей и тетрадей для СОР/СОЧ">
                {isKk ? "Жұмыс дәптерлері мен БЖБ/ТЖБ дәптерлерін тексеру" : "Проверка рабочих тетрадей и тетрадей СОР/СОЧ"}
              </option>
              <option value="Адаптация учащихся (1, 5, 10 классы) к новым условиям обучения">
                {isKk ? "1, 5, 10 сынып оқушыларының бейімделуі" : "Адаптация учащихся 1, 5, 10 классов"}
              </option>
              <option value="Методическое сопровождение и адаптация молодых специалистов">
                {isKk ? "Жас мамандармен әдістемелік жұмыс" : "Работа с молодыми специалистами"}
              </option>
              <option value="Контроль соблюдения норм оценивания и объективности выставления баллов">
                {isKk ? "Критериалды бағалау нормаларын сақтау" : "Соблюдение норм критериального оценивания"}
              </option>
              <option value="Подготовка учащихся выпускных классов к итоговой аттестации">
                {isKk ? "9, 11 сыныптарды қорытынды аттестаттауға дайындау" : "Подготовка к итоговой аттестации (9, 11 классы)"}
              </option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">
              {isKk ? "Тексеру нысаны / Кафедра / Сыныптар" : "Объект проверки / Кафедра / Классы"}
            </label>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-rose-500"
            />
          </div>

          <div>
            <label htmlFor="vsk-date" className="text-xs font-semibold text-muted-foreground">
              {isKk ? "Тексеру мерзімі / Күні" : "Сроки / Дата проведения проверки"}
            </label>
            <input
              id="vsk-date"
              type="text"
              value={date}
              onChange={(e) => setInboxDate(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-rose-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">
              {isKk ? "Бақылау мақсаты" : "Цель контроля"}
            </label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border bg-background p-2.5 text-xs outline-none focus:border-rose-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">
              {isKk ? "Нақты байқаулар / Артықшылықтар мен ескертулер" : "Фактические наблюдения / Плюсы и минусы"}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border bg-background p-2.5 text-xs outline-none focus:border-rose-500"
            />
          </div>

          <Button
            onClick={() => void handleGenerate()}
            disabled={loading}
            className="w-full gap-2 bg-gradient-to-r from-rose-500 to-pink-600 font-semibold text-white shadow-lg hover:opacity-90"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {loading
              ? isKk
                ? "Анықтама дайындалуда..."
                : "Составляю справку..."
              : isKk
                ? "МІБ анықтамасын құрастыру"
                : "Сформировать справку ВШК"}
          </Button>
          {error && <p className="text-xs text-rose-400">{error}</p>}
        </CardContent>
      </Card>

      <Card className="flex flex-col md:col-span-7">
        <CardHeader className="flex flex-wrap flex-row items-center justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base">
              {isKk ? "МІБ аналитикалық анықтамасы" : "Аналитическая справка ВШК"}
            </CardTitle>
            <CardDescription>
              {isKk ? "Педагогикалық кеңес немесе директор жанындағы кеңес үшін ресми құжат" : "Официальный документ для совещания при директоре или педсовета"}
            </CardDescription>
          </div>
          {result && (
            <div className="flex flex-wrap gap-1.5">
              <SchoolDocxButton
                title={`${isKk ? "МІБ анықтамасы" : "Справка ВШК"} — ${target.slice(0, 50)}`}
                subtitle={inspectionType}
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
                <FileSpreadsheet className="mx-auto size-10 opacity-30" />
                <p className="text-sm font-medium">
                  {isKk ? "Анықтама осында шығады" : "Справка появится здесь"}
                </p>
              </div>
            </div>
          )}

          {loading && (
            <div className="grid h-80 place-items-center text-center text-muted-foreground">
              <Loader2 className="mx-auto size-8 animate-spin text-rose-400" />
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
  );
}
