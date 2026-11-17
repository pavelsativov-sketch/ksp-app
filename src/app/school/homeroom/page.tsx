"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Check, Printer, Sparkles, Users } from "lucide-react";
import { RosterPicker } from "@/components/school/roster-picker";
import { SchoolDocxButton } from "@/components/school/school-docx-button";
import { useUiLocale } from "@/components/i18n/use-ui-locale";

export default function HomeroomPage() {
  const { locale } = useUiLocale();
  const isKk = locale === "kk";

  const [topic, setTopic] = useState(
    "Безопасность в цифровой среде, профилактика кибербуллинга и игровая зависимость",
  );
  const [grade, setGrade] = useState("7 класс");
  const [quarter, setQuarter] = useState("2 четверть");
  const [agendaCustom, setAgendaCustom] = useState(
    "Итоги успеваемости за прошедший период, организация питания, школьная форма",
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
          tool: "homeroom",
          params: { topic, grade, quarter, agendaCustom, language: isKk ? "kz" : "ru" },
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
        <p className="editorial-kicker text-emerald-400">
          {isKk ? "«Біртұтас тәрбие» тәрбие жұмысы" : "Воспитательная работа «Біртұтас тәрбие»"}
        </p>
        <h1 className="editorial-display mt-1 text-3xl font-bold">
          {isKk
            ? "Ата-аналар жиналысы және сынып жетекшілігі"
            : "Родительские собрания и классное руководство"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isKk
            ? "1 басумен толық құжаттар топтамасы: күн тәртібі, сынып жетекшісінің баяндамасы, ата-аналарға жадынама және ресми хаттама (Word форматымен)."
            : "Полный пакет документов в 1 клик: повестка дня, готовый доклад учителя на 5–7 минут, памятка родителям и официальный протокол с выгрузкой в Word."}
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-12">
        <Card className="md:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">
              {isKk ? "Жиналыс тақырыбы мен параметрлері" : "Тема и параметры собрания"}
            </CardTitle>
            <CardDescription>
              {isKk ? "Сыныпты журналдан таңдаңыз немесе қолмен жазыңыз" : "Выберите класс из журнала или задайте свою тему"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <RosterPicker
              mode="class"
              locale={locale}
              onSelectClass={(cls, _scores, summaryText) => {
                setGrade(cls);
                if (summaryText) {
                  setAgendaCustom((prev) => `${summaryText}\n${prev}`.slice(0, 500));
                }
              }}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  {isKk ? "Сынып" : "Класс"}
                </label>
                <input
                  type="text"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  {isKk ? "Тоқсан" : "Четверть"}
                </label>
                <select
                  value={quarter}
                  onChange={(e) => setQuarter(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-2.5 py-2 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="1 четверть">{isKk ? "1 тоқсан" : "1 четверть"}</option>
                  <option value="2 четверть">{isKk ? "2 тоқсан" : "2 четверть"}</option>
                  <option value="3 четверть">{isKk ? "3 тоқсан" : "3 четверть"}</option>
                  <option value="4 четверть">{isKk ? "4 тоқсан" : "4 четверть"}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {isKk ? "Жиналыстың негізгі тақырыбы" : "Основная тема собрания"}
              </label>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:border-emerald-500"
              >
                <option value="Безопасность в цифровой среде, профилактика кибербуллинга и игровая зависимость">
                  {isKk ? "Цифрлық қауіпсіздік және буллингтің алдын алу" : "Цифровая безопасность и профилактика буллинга"}
                </option>
                <option value="Адаптация учащихся к новому учебному году и новым требованиям">
                  {isKk ? "Жаңа оқу жылына бейімделу" : "Адаптация к учебному году и новым предметам"}
                </option>
                <option value="Подготовка к СОР и СОЧ: как помочь ребёнку справиться со стрессом">
                  {isKk ? "БЖБ/ТЖБ-ға дайындық және психологиялық қолдау" : "Подготовка к СОР/СОЧ и психологическая поддержка"}
                </option>
                <option value="Профориентация подростков и осознанный выбор будущей профессии">
                  {isKk ? "Кәсіптік бағдар және бейін таңдау" : "Профориентация и выбор профиля обучения"}
                </option>
                <option value="Итоги учебной четверти: успеваемость, посещаемость и мотивация">
                  {isKk ? "Тоқсан қорытындысы: үлгерім және қатысу" : "Итоги учебной четверти и задачи на будущее"}
                </option>
                <option value="Профилактика правонарушений, ПДД и безопасность во время каникул">
                  {isKk ? "Демалыс кезіндегі қауіпсіздік және ЖҚЕ" : "Безопасность на каникулах, ПДД и ПБ"}
                </option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {isKk ? "Күн тәртібінің қосымша сұрақтары" : "Дополнительные вопросы повестки"}
              </label>
              <textarea
                value={agendaCustom}
                onChange={(e) => setAgendaCustom(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border bg-background p-2.5 text-xs outline-none focus:border-emerald-500"
              />
            </div>

            <Button
              onClick={() => void handleGenerate()}
              disabled={loading || !topic.trim()}
              className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-violet-600 font-semibold text-white shadow-lg hover:opacity-90"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {loading
                ? isKk
                  ? "Құжаттар дайындалуда..."
                  : "Формирую материалы..."
                : isKk
                  ? "Құжаттар топтамасын жасау"
                  : "Сформировать пакет документов"}
            </Button>
            {error && <p className="text-xs text-rose-400">{error}</p>}
          </CardContent>
        </Card>

        <Card className="flex flex-col md:col-span-7">
          <CardHeader className="flex flex-wrap flex-row items-center justify-between gap-2 pb-3">
            <div>
              <CardTitle className="text-base">
                {isKk ? "Жиналыс материалдарының топтамасы" : "Пакет материалов собрания"}
              </CardTitle>
              <CardDescription>
                {isKk ? "Күн тәртібі, баяндама, жадынама және хаттама" : "Повестка, доклад, памятка и протокол"}
              </CardDescription>
            </div>
            {result && (
              <div className="flex flex-wrap gap-1.5">
                <SchoolDocxButton
                  title={`${isKk ? "Ата-аналар жиналысы" : "Родительское собрание"} — ${grade}`}
                  subtitle={`${quarter} · ${topic.slice(0, 80)}`}
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
                  <Users className="mx-auto size-10 opacity-30" />
                  <p className="text-sm font-medium">
                    {isKk ? "Құжаттар осында шығады" : "Документы появятся здесь"}
                  </p>
                </div>
              </div>
            )}
            {loading && (
              <div className="grid h-80 place-items-center text-center text-muted-foreground">
                <Loader2 className="mx-auto size-8 animate-spin text-emerald-400" />
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
