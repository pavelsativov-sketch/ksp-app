"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Check, Printer, Sparkles, UserCheck } from "lucide-react";
import { RosterPicker } from "@/components/school/roster-picker";
import { SchoolDocxButton } from "@/components/school/school-docx-button";
import { useUiLocale } from "@/components/i18n/use-ui-locale";

export default function CharacteristicsPage() {
  const { locale } = useUiLocale();
  const isKk = locale === "kk";

  const [studentName, setStudentName] = useState("Иванов Арман Даниярович");
  const [grade, setGrade] = useState("8 «Б» класс");
  const [purpose, setPurpose] = useState("Для психолого-медико-педагогической комиссии (ПМПК)");
  const [academic, setAcademic] = useState(
    "Трудности в освоении точных наук (математика, физика). Низкая мотивация к обучению, темп работы замедленный.",
  );
  const [behavior, setBehavior] = useState(
    "Дисциплинированный, неконфликтный. На уроках пассивен, часто отвлекается.",
  );
  const [social, setSocial] = useState(
    "В коллективе занимает нейтральную позицию, общается с узким кругом одноклассников.",
  );
  const [additional] = useState(
    "Семья полная, родители заинтересованы в успеваемости, посещают родительские собрания.",
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
          tool: "characteristic",
          params: {
            studentName,
            grade,
            purpose,
            academic,
            behavior,
            social,
            additional,
            language: isKk ? "kz" : "ru",
          },
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
        <p className="editorial-kicker text-violet-400">
          {isKk ? "Сынып жетекшісінің құжаттамасы" : "Документация классного руководителя"}
        </p>
        <h1 className="editorial-display mt-1 text-3xl font-bold">
          {isKk ? "Мінездемелер генераторы" : "Генератор характеристик"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isKk
            ? "ПМПК, қорғаншылық органдары, аттестаттау немесе сынып ұжымы үшін ресми психологиялық-педагогикалық мінездемелерді 1 минутта дайындаңыз (Word форматымен)."
            : "Создание официальных психолого-педагогических характеристик за 1 минуту: для ПМПК, органов опеки, аттестации, слабоуспевающих, одарённых детей или характеристики класса (с выгрузкой в Word)."}
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-12">
        <Card className="md:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">
              {isKk ? "Бастапқы деректер" : "Исходные данные"}
            </CardTitle>
            <CardDescription>
              {isKk ? "Оқушыны базадан таңдаңыз немесе қолмен енгізіңіз" : "Выберите ученика из журнала или задайте ориентиры"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <RosterPicker
              mode="student"
              locale={locale}
              onSelectStudent={(st, summaryText) => {
                setStudentName(st.fullName);
                setGrade(st.className);
                if (summaryText) setAcademic(summaryText);
              }}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  {isKk ? "Оқушының аты-жөні" : "ФИО учащегося"}
                </label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
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
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {isKk ? "Мақсаты / Қайда ұсынылады" : "Цель / Куда предоставляется"}
              </label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-violet-500"
              >
                <option value="Для психолого-медико-педагогической комиссии (ПМПК)">
                  {isKk ? "ПМПК комиссиясы үшін" : "Для комиссии ПМПК"}
                </option>
                <option value="Для комиссии по делам несовершеннолетних / ВШУ">
                  {isKk ? "Кәмелетке толмағандар ісі жөніндегі комиссия үшін" : "Для комиссии по делам несовершеннолетних (ВШУ)"}
                </option>
                <option value="Для органов опеки и попечительства">
                  {isKk ? "Қорғаншылық және қамқоршылық органдары үшін" : "Для органов опеки и попечительства"}
                </option>
                <option value="На слабоуспевающего учащегося (для завуча)">
                  {isKk ? "Үлгерімі төмен оқушыға" : "На слабоуспевающего учащегося"}
                </option>
                <option value="На одарённого учащегося (для олимпиад/награждения)">
                  {isKk ? "Дарынды оқушыға (олимпиада/марапаттау)" : "На одарённого учащегося (олимпиады/награды)"}
                </option>
                <option value="Общая характеристика учащегося при переходе в другую школу">
                  {isKk ? "Басқа мектепке ауысу кезінде" : "При переводе в другую школу"}
                </option>
                <option value="Психолого-педагогическая характеристика классного коллектива">
                  {isKk ? "Сынып ұжымының жалпы мінездемесі" : "Характеристика класса в целом"}
                </option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {isKk ? "Оқу әрекеті және үлгерімі" : "Учебная деятельность и успеваемость"}
              </label>
              <textarea
                value={academic}
                onChange={(e) => setAcademic(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border bg-background p-2.5 text-xs outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {isKk ? "Тәртібі мен мінез-құлқы" : "Поведение, дисциплина и характер"}
              </label>
              <textarea
                value={behavior}
                onChange={(e) => setBehavior(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border bg-background p-2.5 text-xs outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {isKk ? "Ұжыммен қарым-қатынасы және отбасы" : "Отношения с коллективом и семья"}
              </label>
              <textarea
                value={social}
                onChange={(e) => setSocial(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border bg-background p-2.5 text-xs outline-none focus:border-violet-500"
              />
            </div>

            <Button
              onClick={() => void handleGenerate()}
              disabled={loading || !studentName.trim()}
              className="w-full gap-2 bg-gradient-to-r from-violet-500 to-violet-600 font-semibold text-white shadow-lg hover:opacity-90"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {loading
                ? isKk
                  ? "Мінездеме жазылуда..."
                  : "Составляю характеристику..."
                : isKk
                  ? "Мінездеме құрастыру"
                  : "Составить характеристику"}
            </Button>
            {error && <p className="text-xs text-rose-400">{error}</p>}
          </CardContent>
        </Card>

        <Card className="flex flex-col md:col-span-7">
          <CardHeader className="flex flex-wrap flex-row items-center justify-between gap-2 pb-3">
            <div>
              <CardTitle className="text-base">
                {isKk ? "Дайын мінездеме" : "Готовая характеристика"}
              </CardTitle>
              <CardDescription>
                {isKk ? "Ресми педагогикалық құжат" : "Официальный юридически грамотный текст"}
              </CardDescription>
            </div>
            {result && (
              <div className="flex flex-wrap gap-1.5">
                <SchoolDocxButton
                  title={`${isKk ? "Мінездеме" : "Характеристика"} — ${studentName}`}
                  subtitle={`${grade} · ${purpose}`}
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
                  <UserCheck className="mx-auto size-10 opacity-30" />
                  <p className="text-sm font-medium">
                    {isKk ? "Мінездеме осында шығады" : "Характеристика появится здесь"}
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
    </main>
  );
}
