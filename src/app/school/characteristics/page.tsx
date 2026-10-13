"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Check, Printer, Sparkles, UserCheck, FileText } from "lucide-react";

export default function CharacteristicsPage() {
  const [studentName, setStudentName] = useState("Иванов Арман Даниярович");
  const [grade, setGrade] = useState("8 «Б» класс");
  const [purpose, setPurpose] = useState("Для психолого-медико-педагогической комиссии (ПМПК)");
  const [academic, setAcademic] = useState("Трудности в освоении точных наук (математика, физика). Низкая мотивация к обучению, темп работы замедленный.");
  const [behavior, setBehavior] = useState("Дисциплинированный, неконфликтный. На уроках пассивен, часто отвлекается.");
  const [social, setSocial] = useState("В коллективе занимает нейтральную позицию, общается с узким кругом одноклассников.");
  const [additional, setAdditional] = useState("Семья полная, родители заинтересованы в успеваемости, посещают родительские собрания.");

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
          tool: "characteristic",
          params: { studentName, grade, purpose, academic, behavior, social, additional },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка генерации");
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сформировать характеристику");
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
        <p className="editorial-kicker text-indigo-400">Документация классного руководителя</p>
        <h1 className="editorial-display mt-1 text-3xl font-bold">Генератор характеристик</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Создание официальных психолого-педагогических характеристик за 1 минуту: для ПМПК, органов опеки, аттестации, слабоуспевающих, одарённых детей или характеристики классного коллектива.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-12">
        <Card className="md:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">Исходные данные</CardTitle>
            <CardDescription>Задайте ориентиры для характеристики</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">ФИО учащегося</label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Класс</label>
                <input
                  type="text"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Цель / Куда предоставляется</label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-indigo-500"
              >
                <option value="Для психолого-медико-педагогической комиссии (ПМПК)">Для комиссии ПМПК</option>
                <option value="Для комиссии по делам несовершеннолетних / ВШУ">Для комиссии по делам несовершеннолетних (ВШУ)</option>
                <option value="Для органов опеки и попечительства">Для органов опеки и попечительства</option>
                <option value="На слабоуспевающего учащегося (для завуча)">На слабоуспевающего учащегося</option>
                <option value="На одарённого учащегося (для олимпиад/награждения)">На одарённого учащегося (олимпиады/награды)</option>
                <option value="Общая характеристика учащегося при переходе в другую школу">При переводе в другую школу</option>
                <option value="Психолого-педагогическая характеристика классного коллектива">Характеристика класса в целом</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Учебная деятельность и успеваемость</label>
              <textarea
                value={academic}
                onChange={(e) => setAcademic(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border bg-background p-2.5 text-xs outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Поведение, дисциплина и характер</label>
              <textarea
                value={behavior}
                onChange={(e) => setBehavior(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border bg-background p-2.5 text-xs outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Отношения с коллективом и семья</label>
              <textarea
                value={social}
                onChange={(e) => setSocial(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border bg-background p-2.5 text-xs outline-none focus:border-indigo-500"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading || !studentName.trim()}
              className="w-full gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 font-semibold text-white shadow-lg hover:opacity-90"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {loading ? "Составляю характеристику..." : "Составить характеристику"}
            </Button>
            {error && <p className="text-xs text-rose-400">{error}</p>}
          </CardContent>
        </Card>

        <Card className="flex flex-col md:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Готовая характеристика</CardTitle>
              <CardDescription>Официальный юридически грамотный текст</CardDescription>
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
                  <UserCheck className="mx-auto size-10 opacity-30" />
                  <p className="text-sm font-medium">Характеристика появится здесь</p>
                  <p className="text-xs text-muted-foreground/70">
                    Укажите имя и ключевые тезисы — ИИ сформулирует официальный документ с выводами и рекомендациями
                  </p>
                </div>
              </div>
            )}

            {loading && (
              <div className="grid h-80 place-items-center text-center text-muted-foreground">
                <div className="space-y-3">
                  <Loader2 className="mx-auto size-8 animate-spin text-indigo-400" />
                  <p className="text-sm font-medium text-slate-200">ИИ формирует характеристику...</p>
                  <p className="text-xs text-muted-foreground/70">Подбираются педагогические формулировки и психологические выводы</p>
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
