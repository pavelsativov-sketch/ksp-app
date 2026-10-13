"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Check, Printer, Sparkles, FileSpreadsheet, ShieldAlert } from "lucide-react";

export function VskSpravkaClient() {
  const [inspectionType, setInspectionType] = useState("Посещение и анализ уроков педагогов");
  const [target, setTarget] = useState("Учителя естественно-математического цикла (5–9 классы)");
  const [date, setDate] = useState(new Date().toLocaleDateString("ru-RU"));
  const [purpose, setPurpose] = useState("Определение соответствия поурочного планирования требованиям ГОСО, эффективность использования формативного оценивания");
  const [notes, setNotes] = useState("Большинство педагогов используют критериальное оценивание. У двух молодых специалистов выявлены затруднения с дифференциацией заданий на этапе закрепления.");

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
          params: { inspectionType, target, date, purpose, notes },
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
          <CardTitle className="text-base">Параметры проверки ВШК</CardTitle>
          <CardDescription>Задайте вводные данные для аналитической справки</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Направление контроля</label>
            <select
              value={inspectionType}
              onChange={(e) => setInspectionType(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:border-rose-500"
            >
              <option value="Посещение и анализ уроков педагогов">Посещение и анализ уроков педагогов</option>
              <option value="Проверка поурочных планов (КСП) и календарно-тематических планов (КТП)">
                Проверка поурочных планов (КСП) и КТП
              </option>
              <option value="Контроль качества ведения рабочих тетрадей и тетрадей для СОР/СОЧ">
                Проверка рабочих тетрадей и тетрадей СОР/СОЧ
              </option>
              <option value="Адаптация учащихся (1, 5, 10 классы) к новым условиям обучения">
                Адаптация учащихся 1, 5, 10 классов
              </option>
              <option value="Методическое сопровождение и адаптация молодых специалистов">
                Работа с молодыми специалистами
              </option>
              <option value="Контроль соблюдения норм оценивания и объективности выставления баллов">
                Соблюдение норм критериального оценивания
              </option>
              <option value="Подготовка учащихся выпускных классов к итоговой аттестации">
                Подготовка к итоговой аттестации (9, 11 классы)
              </option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Объект проверки / Кафедра / Классы</label>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-rose-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Сроки / Дата проведения проверки</label>
            <input
              type="text"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-rose-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Цель контроля</label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border bg-background p-2.5 text-xs outline-none focus:border-rose-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Фактические наблюдения / Плюсы и минусы</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Что увидели: сильные стороны уроков, типичные недочёты, рекомендации..."
              className="mt-1 w-full rounded-lg border bg-background p-2.5 text-xs outline-none focus:border-rose-500"
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full gap-2 bg-gradient-to-r from-rose-500 to-pink-600 font-semibold text-white shadow-lg hover:opacity-90"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {loading ? "Составляю справку..." : "Сформировать справку ВШК"}
          </Button>
          {error && <p className="text-xs text-rose-400">{error}</p>}
        </CardContent>
      </Card>

      <Card className="flex flex-col md:col-span-7">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">Аналитическая справка ВШК</CardTitle>
            <CardDescription>Официальный документ для совещания при директоре или педсовета</CardDescription>
          </div>
          {result && (
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
                {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                {copied ? "Скопировано" : "Копировать"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5 text-xs">
                <Printer className="size-3.5" /> Печать
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex-1">
          {!result && !loading && (
            <div className="grid h-80 place-items-center text-center text-muted-foreground">
              <div className="space-y-2">
                <FileSpreadsheet className="mx-auto size-10 opacity-30" />
                <p className="text-sm font-medium">Справка появится здесь</p>
                <p className="text-xs text-muted-foreground/70">
                  Завучу больше не нужно писать страницы текста вручную: ИИ структурирует вводную часть, констатацию фактов, выводы и проект решения
                </p>
              </div>
            </div>
          )}

          {loading && (
            <div className="grid h-80 place-items-center text-center text-muted-foreground">
              <div className="space-y-3">
                <Loader2 className="mx-auto size-8 animate-spin text-rose-400" />
                <p className="text-sm font-medium text-slate-200">ИИ формирует официальную справку ВШК...</p>
                <p className="text-xs text-muted-foreground/70">Подбираются нормативные формулировки и проект управленческого решения</p>
              </div>
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
