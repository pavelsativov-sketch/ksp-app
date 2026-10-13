"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Check, Printer, Sparkles, BarChart3, HelpCircle } from "lucide-react";

export default function SorSochPage() {
  const [subject, setSubject] = useState("Алгебра");
  const [grade, setGrade] = useState("8");
  const [quarter, setQuarter] = useState("1");
  const [workType, setWorkType] = useState("СОР №1");
  const [maxScore, setMaxScore] = useState("20");
  const [scores, setScores] = useState("18, 15, 20, 14, 12, 19, 16, 11, 20, 17, 13, 8, 15, 17, 16, 14, 19, 18, 15, 10");
  const [topic, setTopic] = useState("Квадратные корни и действительные числа");
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Быстрый локальный расчёт для наглядности учителю
  const parsedScores = scores
    .split(/[\s,;]+/)
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0);
  const max = Number(maxScore) || 20;
  const count = parsedScores.length;
  const avg = count ? (parsedScores.reduce((a, b) => a + b, 0) / count).toFixed(1) : 0;
  const qualityCount = parsedScores.filter((s) => s / max >= 0.65).length;
  const qualityPercent = count ? Math.round((qualityCount / count) * 100) : 0;
  const passCount = parsedScores.filter((s) => s / max >= 0.4).length;
  const passPercent = count ? Math.round((passCount / count) * 100) : 0;

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/school/ai-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "sor-soch",
          params: { subject, grade, quarter, workType, maxScore, scores, topic },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка генерации");
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сформировать анализ");
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
        <p className="editorial-kicker text-sky-400">Педагогическая отчётность</p>
        <h1 className="editorial-display mt-1 text-3xl font-bold">Анализ результатов СОР и СОЧ</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Без повторного ввода учеников: просто укажите баллы класса через запятую. ИИ мгновенно рассчитает качество, успеваемость, распределение по уровням мышления и подготовит методический отчёт с рекомендациями для завуча.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-12">
        {/* Форма параметров */}
        <Card className="md:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">Параметры работы</CardTitle>
            <CardDescription>Заполните исходные данные оценивания</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Предмет</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Класс</label>
                <input
                  type="text"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  placeholder="8"
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Четверть</label>
                <select
                  value={quarter}
                  onChange={(e) => setQuarter(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-2.5 py-2 text-sm outline-none focus:border-sky-500"
                >
                  <option value="1">1 четв.</option>
                  <option value="2">2 четв.</option>
                  <option value="3">3 четв.</option>
                  <option value="4">4 четв.</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Вид работы</label>
                <select
                  value={workType}
                  onChange={(e) => setWorkType(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-2.5 py-2 text-sm outline-none focus:border-sky-500"
                >
                  <option value="СОР №1">СОР №1</option>
                  <option value="СОР №2">СОР №2</option>
                  <option value="СОР №3">СОР №3</option>
                  <option value="СОЧ">СОЧ</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Макс. балл</label>
                <input
                  type="number"
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-2.5 py-2 text-sm outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Тема / Разделы СОР/СОЧ</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Например: Квадратные корни и действительные числа"
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">Баллы учащихся класса</label>
                <span className="text-[11px] text-muted-foreground">Учеников: {count}</span>
              </div>
              <textarea
                value={scores}
                onChange={(e) => setScores(e.target.value)}
                rows={4}
                placeholder="18, 15, 20, 14, 12, 19, 16..."
                className="mt-1 w-full rounded-lg border bg-background p-3 font-mono text-xs outline-none focus:border-sky-500"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Просто скопируйте столбец баллов из Excel или введите через запятую/пробел.
              </p>
            </div>

            {/* Мгновенные экспресс-показатели */}
            {count > 0 && (
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-center">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Качество</p>
                  <p className="text-base font-bold text-sky-400">{qualityPercent}%</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Успеваемость</p>
                  <p className="text-base font-bold text-emerald-400">{passPercent}%</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Средний балл</p>
                  <p className="text-base font-bold text-slate-200">{avg} / {max}</p>
                </div>
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={loading || count === 0}
              className="w-full gap-2 bg-gradient-to-r from-sky-500 to-indigo-600 font-semibold text-white shadow-lg hover:opacity-90"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {loading ? "Формирую анализ..." : "Сформировать отчёт для завуча"}
            </Button>
            {error && <p className="text-xs text-rose-400">{error}</p>}
          </CardContent>
        </Card>

        {/* Результат анализа */}
        <Card className="flex flex-col md:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Педагогический отчёт</CardTitle>
              <CardDescription>Готовый документ по стандартам МОН РК</CardDescription>
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
                  <BarChart3 className="mx-auto size-10 opacity-30" />
                  <p className="text-sm font-medium">Отчёт появится здесь</p>
                  <p className="text-xs text-muted-foreground/70">
                    Нажмите кнопку слева — ИИ проанализирует уровни мышления, типичные ошибки и составит план коррекции
                  </p>
                </div>
              </div>
            )}

            {loading && (
              <div className="grid h-80 place-items-center text-center text-muted-foreground">
                <div className="space-y-3">
                  <Loader2 className="mx-auto size-8 animate-spin text-sky-400" />
                  <p className="text-sm font-medium text-slate-200">ИИ анализирует результаты и дескрипторы...</p>
                  <p className="text-xs text-muted-foreground/70">Рассчитываются проценты, пробелы и рекомендации для завуча</p>
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
