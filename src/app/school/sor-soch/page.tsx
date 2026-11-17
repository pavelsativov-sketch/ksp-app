"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Check, Printer, Sparkles, BarChart3, FileCheck2 } from "lucide-react";
import { SorSochGenerator } from "@/components/school/sor-soch-generator";
import { RosterPicker } from "@/components/school/roster-picker";
import { SchoolDocxButton } from "@/components/school/school-docx-button";
import { useUiLocale } from "@/components/i18n/use-ui-locale";

export default function SorSochPage() {
  const { locale } = useUiLocale();
  const isKk = locale === "kk";
  const [mode, setMode] = useState<"create" | "analyze">("create");

  const [subject, setSubject] = useState("Алгебра");
  const [grade, setGrade] = useState("8");
  const [quarter, setQuarter] = useState("1");
  const [workType, setWorkType] = useState("СОР №1");
  const [maxScore, setMaxScore] = useState("20");
  const [scores, setScores] = useState(
    "18, 15, 20, 14, 12, 19, 16, 11, 20, 17, 13, 8, 15, 17, 16, 14, 19, 18, 15, 10",
  );
  const [topic, setTopic] = useState("Квадратные корни и действительные числа");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          params: {
            subject,
            grade,
            quarter,
            workType,
            maxScore,
            scores,
            topic,
            language: isKk ? "kz" : "ru",
          },
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
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6">
      <header className="space-y-3">
        <p className="editorial-kicker text-violet-400">
          {isKk ? "Критериалды бағалау (БЖБ / ТЖБ)" : "Суммативное оценивание (СОР / СОЧ)"}
        </p>
        <h1 className="editorial-display text-3xl font-bold">
          {isKk
            ? "БЖБ және ТЖБ конструкторы мен талдауы"
            : "Конструктор и анализ СОР / СОЧ (БЖБ / ТЖБ)"}
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {isKk
            ? "МЖМБС оқу мақсаттары бойынша 2 тең нұсқалы БЖБ/ТЖБ, дескрипторлар мен рубрика құрастырыңыз немесе өткізілген жұмыс бойынша дайын талдау есебін алыңыз."
            : "Создавайте готовые комплекты СОР/СОЧ на 2 варианта с дескрипторами, ключами и рубрикой для родителей в Word, либо формируйте педагогический анализ результатов для завуча."}
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            variant={mode === "create" ? "default" : "outline"}
            onClick={() => setMode("create")}
            className="gap-2"
          >
            <FileCheck2 className="size-4" />
            {isKk
              ? "БЖБ / ТЖБ құрастыру (2 нұсқа + дескрипторлар)"
              : "Создать СОР / СОЧ (2 варианта + дескрипторы)"}
          </Button>
          <Button
            type="button"
            variant={mode === "analyze" ? "default" : "outline"}
            onClick={() => setMode("analyze")}
            className="gap-2"
          >
            <BarChart3 className="size-4" />
            {isKk ? "БЖБ / ТЖБ нәтижелерін талдау" : "Анализ результатов СОР / СОЧ"}
          </Button>
        </div>
      </header>

      {mode === "create" ? (
        <SorSochGenerator locale={locale} />
      ) : (
        <div className="grid gap-6 md:grid-cols-12">
          <Card className="md:col-span-5">
            <CardHeader>
              <CardTitle className="text-base">
                {isKk ? "Жұмыс параметрлері" : "Параметры работы"}
              </CardTitle>
              <CardDescription>
                {isKk ? "Бағалау деректерін енгізіңіз" : "Заполните исходные данные оценивания"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <RosterPicker
                mode="class"
                locale={locale}
                onSelectClass={(cls, classScores) => {
                  setGrade(cls);
                  if (classScores.length > 0) {
                    const scaled = classScores.map((s) =>
                      Math.max(1, Math.round((s / 10) * (Number(maxScore) || 20))),
                    );
                    setScores(scaled.join(", "));
                  }
                }}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    {isKk ? "Пән" : "Предмет"}
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-violet-500"
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
                    placeholder="8"
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    {isKk ? "Тоқсан" : "Четверть"}
                  </label>
                  <select
                    value={quarter}
                    onChange={(e) => setQuarter(e.target.value)}
                    className="mt-1 w-full rounded-lg border bg-background px-2.5 py-2 text-sm outline-none focus:border-violet-500"
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    {isKk ? "Жұмыс түрі" : "Вид работы"}
                  </label>
                  <select
                    value={workType}
                    onChange={(e) => setWorkType(e.target.value)}
                    className="mt-1 w-full rounded-lg border bg-background px-2.5 py-2 text-sm outline-none focus:border-violet-500"
                  >
                    <option value="СОР №1">СОР №1 / БЖБ №1</option>
                    <option value="СОР №2">СОР №2 / БЖБ №2</option>
                    <option value="СОР №3">СОР №3 / БЖБ №3</option>
                    <option value="СОЧ">СОЧ / ТЖБ</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    {isKk ? "Макс. балл" : "Макс. балл"}
                  </label>
                  <input
                    type="number"
                    value={maxScore}
                    onChange={(e) => setMaxScore(e.target.value)}
                    className="mt-1 w-full rounded-lg border bg-background px-2.5 py-2 text-sm outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  {isKk ? "Тақырып / Бөлімдер" : "Тема / Разделы СОР/СОЧ"}
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground">
                    {isKk ? "Сынып оқушыларының баллдары" : "Баллы учащихся класса"}
                  </label>
                  <span className="text-[11px] text-muted-foreground">
                    {isKk ? `Оқушылар: ${count}` : `Учеников: ${count}`}
                  </span>
                </div>
                <textarea
                  value={scores}
                  onChange={(e) => setScores(e.target.value)}
                  rows={4}
                  placeholder="18, 15, 20, 14, 12, 19, 16..."
                  className="mt-1 w-full rounded-lg border bg-background p-3 text-xs tabular-nums outline-none focus:border-violet-500"
                />
              </div>

              {count > 0 && (
                <div className="grid grid-cols-3 gap-2 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 text-center">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      {isKk ? "Сапа" : "Качество"}
                    </p>
                    <p className="text-base font-bold text-violet-400">{qualityPercent}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      {isKk ? "Үлгерім" : "Успеваемость"}
                    </p>
                    <p className="text-base font-bold text-emerald-400">{passPercent}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      {isKk ? "Орташа балл" : "Средний балл"}
                    </p>
                    <p className="text-base font-bold">
                      {avg} / {max}
                    </p>
                  </div>
                </div>
              )}

              <Button
                onClick={() => void handleGenerate()}
                disabled={loading || count === 0}
                className="w-full gap-2 bg-gradient-to-r from-violet-500 to-violet-600 font-semibold text-white shadow-lg hover:opacity-90"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {loading
                  ? isKk
                    ? "Талдау жасалуда..."
                    : "Формирую анализ..."
                  : isKk
                    ? "Оқу ісінің меңгерушісіне есеп жасау"
                    : "Сформировать отчёт для завуча"}
              </Button>
              {error && <p className="text-xs text-rose-400">{error}</p>}
            </CardContent>
          </Card>

          <Card className="flex flex-col md:col-span-7">
            <CardHeader className="flex flex-wrap flex-row items-center justify-between gap-2 pb-3">
              <div>
                <CardTitle className="text-base">
                  {isKk ? "Педагогикалық талдау есебі" : "Педагогический отчёт"}
                </CardTitle>
                <CardDescription>
                  {isKk ? "ҚР ОМ стандарттарына сәйкес құжат" : "Готовый документ по стандартам МП РК"}
                </CardDescription>
              </div>
              {result && (
                <div className="flex flex-wrap gap-1.5">
                  <SchoolDocxButton
                    title={`${isKk ? "Талдау" : "Анализ"} ${workType} — ${subject} (${grade})`}
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
                    <BarChart3 className="mx-auto size-10 opacity-30" />
                    <p className="text-sm font-medium">
                      {isKk ? "Есеп осында шығады" : "Отчёт появится здесь"}
                    </p>
                  </div>
                </div>
              )}
              {loading && (
                <div className="grid h-80 place-items-center text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-8 animate-spin text-violet-400" />
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
      )}
    </main>
  );
}
