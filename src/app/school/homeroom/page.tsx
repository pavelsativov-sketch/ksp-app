"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Check, Printer, Sparkles, Users, MessageSquare } from "lucide-react";

export default function HomeroomPage() {
  const [topic, setTopic] = useState("Безопасность в цифровой среде, профилактика кибербуллинга и игровая зависимость");
  const [grade, setGrade] = useState("7 класс");
  const [quarter, setQuarter] = useState("2 четверть");
  const [agendaCustom, setAgendaCustom] = useState("Итоги успеваемости за прошедший период, организация питания, школьная форма");

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
          tool: "homeroom",
          params: { topic, grade, quarter, agendaCustom },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка генерации");
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сформировать материалы собрания");
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
        <p className="editorial-kicker text-emerald-400">Воспитательная работа «Біртұтас тәрбие»</p>
        <h1 className="editorial-display mt-1 text-3xl font-bold">Родительские собрания и классное руководство</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Полный пакет документов в 1 клик: повестка дня, готовый доклад учителя на 5–7 минут, памятка родителям и официальный протокол с решениями.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-12">
        <Card className="md:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">Тема и параметры собрания</CardTitle>
            <CardDescription>Выберите типовую тему или задайте свою</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Класс</label>
                <input
                  type="text"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Четверть</label>
                <select
                  value={quarter}
                  onChange={(e) => setQuarter(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-2.5 py-2 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="1 четверть">1 четверть</option>
                  <option value="2 четверть">2 четверть</option>
                  <option value="3 четверть">3 четверть</option>
                  <option value="4 четверть">4 четверть</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Основная тема собрания</label>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:border-emerald-500"
              >
                <option value="Безопасность в цифровой среде, профилактика кибербуллинга и игровая зависимость">
                  Цифровая безопасность и профилактика буллинга
                </option>
                <option value="Адаптация учащихся к новому учебному году и новым требованиям">
                  Адаптация к учебному году и новым предметам
                </option>
                <option value="Подготовка к СОР и СОЧ: как помочь ребёнку справиться со стрессом">
                  Подготовка к СОР/СОЧ и психологическая поддержка
                </option>
                <option value="Профориентация подростков и осознанный выбор будущей профессии">
                  Профориентация и выбор профиля обучения
                </option>
                <option value="Итоги учебной четверти: успеваемость, посещаемость и мотивация">
                  Итоги учебной четверти и задачи на будущее
                </option>
                <option value="Профилактика правонарушений, ПДД и безопасность во время каникул">
                  Безопасность на каникулах, ПДД и ПБ
                </option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Дополнительные вопросы повестки</label>
              <textarea
                value={agendaCustom}
                onChange={(e) => setAgendaCustom(e.target.value)}
                rows={3}
                placeholder="Итоги четверти, экскурсии, питание..."
                className="mt-1 w-full rounded-lg border bg-background p-2.5 text-xs outline-none focus:border-emerald-500"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading || !topic.trim()}
              className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 font-semibold text-white shadow-lg hover:opacity-90"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {loading ? "Формирую материалы..." : "Сформировать пакет документов"}
            </Button>
            {error && <p className="text-xs text-rose-400">{error}</p>}
          </CardContent>
        </Card>

        <Card className="flex flex-col md:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Пакет материалов собрания</CardTitle>
              <CardDescription>Повестка, доклад, памятка и протокол</CardDescription>
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
                  <Users className="mx-auto size-10 opacity-30" />
                  <p className="text-sm font-medium">Документы появятся здесь</p>
                  <p className="text-xs text-muted-foreground/70">
                    ИИ подготовит развёрнутый доклад классного руководителя, тезисы для родителей и готовый протокол с решениями
                  </p>
                </div>
              </div>
            )}

            {loading && (
              <div className="grid h-80 place-items-center text-center text-muted-foreground">
                <div className="space-y-3">
                  <Loader2 className="mx-auto size-8 animate-spin text-emerald-400" />
                  <p className="text-sm font-medium text-slate-200">ИИ составляет материалы собрания...</p>
                  <p className="text-xs text-muted-foreground/70">Генерируются повестка, доклад учителя, памятка и протокол</p>
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
