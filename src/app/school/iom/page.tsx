"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Check, Printer, Sparkles, Target, Compass } from "lucide-react";

export default function IomPage() {
  const [studentName, setStudentName] = useState("Сериков Нурлан");
  const [subject, setSubject] = useState("Математика");
  const [grade, setGrade] = useState("6 класс");
  const [trackType, setTrackType] = useState("Ликвидация пробелов в знаниях (слабоуспевающий)");
  const [gaps, setGaps] = useState("Действия с обыкновенными и десятичными дробями, решение уравнений и текстовых задач на движение");
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
          params: { studentName, subject, grade, trackType, gaps, period },
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
        <p className="editorial-kicker text-amber-400">Дифференцированное обучение</p>
        <h1 className="editorial-display mt-1 text-3xl font-bold">Индивидуальные образовательные маршруты (ИОМ)</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Пошаговые программы работы со слабоуспевающими или высокомотивированными учащимися: диагностика пробелов, понедельный план ликвидации затруднений, дидактические карточки и критерии контроля.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-12">
        <Card className="md:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">Параметры маршрута</CardTitle>
            <CardDescription>Укажите предмет, пробелы и сроки</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Учащийся</label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Класс</label>
                <input
                  type="text"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Предмет</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Срок реализации</label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-2.5 py-2 text-sm outline-none focus:border-amber-500"
                >
                  <option value="2 недели (интенсив)">2 недели (интенсив)</option>
                  <option value="1 месяц (4 недели)">1 месяц (4 недели)</option>
                  <option value="1 учебная четверть">1 четверть</option>
                  <option value="Учебное полугодие">Полугодие</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Направленность маршрута</label>
              <select
                value={trackType}
                onChange={(e) => setTrackType(e.target.value)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:border-amber-500"
              >
                <option value="Ликвидация пробелов в знаниях (слабоуспевающий)">
                  Ликвидация пробелов в знаниях (слабоуспевающий)
                </option>
                <option value="Развитие одарённости и углублённая подготовка к олимпиадам">
                  Развитие одарённости и олимпиадная подготовка
                </option>
                <option value="Подготовка к пересдаче суммативного оценивания (СОР/СОЧ)">
                  Подготовка к пересдаче СОР / СОЧ
                </option>
                <option value="Индивидуальное сопровождение после длительного пропуска уроков">
                  Сопровождение после болезни / пропуска занятий
                </option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Западающие темы / Выявленные затруднения</label>
              <textarea
                value={gaps}
                onChange={(e) => setGaps(e.target.value)}
                rows={3}
                placeholder="Темы пробелов или разделы олимпиадной подготовки..."
                className="mt-1 w-full rounded-lg border bg-background p-2.5 text-xs outline-none focus:border-amber-500"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading || !studentName.trim()}
              className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-600 font-semibold text-white shadow-lg hover:opacity-90"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {loading ? "Формирую маршрут..." : "Сформировать маршрут ИОМ"}
            </Button>
            {error && <p className="text-xs text-rose-400">{error}</p>}
          </CardContent>
        </Card>

        <Card className="flex flex-col md:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Индивидуальный маршрут (ИОМ)</CardTitle>
              <CardDescription>Понедельный план и дидактические шаги</CardDescription>
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
                  <Compass className="mx-auto size-10 opacity-30" />
                  <p className="text-sm font-medium">Маршрут появится здесь</p>
                  <p className="text-xs text-muted-foreground/70">
                    ИИ построит диагностическую карту, понедельные цели, практические упражнения и критерии контроля
                  </p>
                </div>
              </div>
            )}

            {loading && (
              <div className="grid h-80 place-items-center text-center text-muted-foreground">
                <div className="space-y-3">
                  <Loader2 className="mx-auto size-8 animate-spin text-amber-400" />
                  <p className="text-sm font-medium text-slate-200">ИИ проектирует образовательный маршрут...</p>
                  <p className="text-xs text-muted-foreground/70">Формируется понедельный план повторения и консультаций</p>
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
    </main>
  );
}
