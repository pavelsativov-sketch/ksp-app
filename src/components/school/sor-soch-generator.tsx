"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, Download, ExternalLink, FileCheck2, Loader2, Printer, QrCode, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MathText } from "@/lib/math/render-math";
import { ShareQrActions } from "@/components/share/share-toolbar";
import { homeworkShareMessage } from "@/lib/share/messengers";
import type { SorSochWork } from "@/lib/ai/sor-soch-generator";

interface SorOnlineMeta {
  v1Id: string;
  v1Code: string;
  v2Id: string;
  v2Code: string;
  issuedAt: string;
}

interface ObjectiveItem {
  code: string;
  text_ru?: string;
  text_kz?: string | null;
  section?: string | null;
}

const COPY = {
  ru: {
    formTitle: "Параметры разработки СОР / СОЧ",
    formDesc: "2 параллельных варианта + дескрипторы + ключи + рубрика для родителей",
    subject: "Предмет",
    grade: "Класс",
    quarter: "Четверть",
    workType: "Вид работы",
    language: "Язык заданий",
    maxPoints: "Макс. балл",
    duration: "Время (мин)",
    taskCount: "Заданий в варианте",
    sectionLabel: "Раздел / сквозная тема",
    loadGoso: "Найти цели ГОСО",
    selectedObjectives: "Выбранные цели обучения ГОСО (или введите вручную по одной в строке)",
    generateBtn: "Разработать СОР/СОЧ (2 варианта + дескрипторы)",
    generatingBtn: "ИИ разрабатывает оба варианта и ключи…",
    previewTitle: "Готовый комплект суммативного оценивания",
    tabV1: "Вариант 1",
    tabV2: "Вариант 2",
    tabKeys: "Дескрипторы и ключи",
    tabRubric: "Рубрика родителям",
    downloadDocx: "Скачать Word (.docx)",
    printBtn: "Печать",
    emptyTitle: "Комплект СОР / СОЧ появится здесь",
    emptyHint:
      "Выберите предмет, класс, цели ГОСО и нажмите кнопку — ИИ создаст спецификацию, 2 равноценных варианта, таблицу баллов и рубрику.",
    recentWorks: "Недавно созданные комплекты:",
  },
  kk: {
    formTitle: "БЖБ / ТЖБ құрастыру параметрлері",
    formDesc: "2 параллель нұсқа + дескрипторлар + жауап кілттері + ата-ана рубрикасы",
    subject: "Пән",
    grade: "Сынып",
    quarter: "Тоқсан",
    workType: "Жұмыс түрі",
    language: "Тапсырма тілі",
    maxPoints: "Ең жоғары балл",
    duration: "Уақыты (мин)",
    taskCount: "Нұсқадағы тапсырма саны",
    sectionLabel: "Бөлім / ортақ тақырып",
    loadGoso: "МЖМБС мақсаттарын жүктеу",
    selectedObjectives: "Таңдалған оқу мақсаттары (немесе әр жолға қолмен енгізіңіз)",
    generateBtn: "БЖБ/ТЖБ құрастыру (2 нұсқа + дескрипторлар)",
    generatingBtn: "ЖИ екі нұсқа мен кілттерді дайындауда…",
    previewTitle: "Дайын жиынтық бағалау жинағы",
    tabV1: "1-нұсқа",
    tabV2: "2-нұсқа",
    tabKeys: "Дескрипторлар мен кілттер",
    tabRubric: "Ата-ана рубрикасы",
    downloadDocx: "Word (.docx) жүктеу",
    printBtn: "Басып шығару",
    emptyTitle: "БЖБ / ТЖБ жинағы осында шығады",
    emptyHint:
      "Пән, сынып және оқу мақсаттарын таңдаңыз — ЖИ 2 тең дәрежелі нұсқа, балл қою кестесі мен рубрика жасайды.",
    recentWorks: "Соңғы жасалған жинақтар:",
  },
} as const;

export function SorSochGenerator({ locale = "ru" }: { locale?: "ru" | "kk" }) {
  const L = COPY[locale];
  const [subject, setSubject] = useState("Алгебра");
  const [grade, setGrade] = useState(8);
  const [quarter, setQuarter] = useState(1);
  const [workType, setWorkType] = useState(locale === "kk" ? "БЖБ №1" : "СОР №1");
  const [workLang, setWorkLang] = useState<"ru" | "kz">(locale === "kk" ? "kz" : "ru");
  const [maxPoints, setMaxPoints] = useState(15);
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [taskCount, setTaskCount] = useState(4);
  const [sectionOrTopic, setSectionOrTopic] = useState("Квадратные корни и действительные числа");
  const [objectivesText, setObjectivesText] = useState(
    "8.1.1.1 знать понятия иррационального и действительного чисел\n8.1.2.1 применять свойства арифметического квадратного корня",
  );

  const [gosoOptions, setGosoOptions] = useState<ObjectiveItem[]>([]);
  const [loadingGoso, setLoadingGoso] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [issuingOnline, setIssuingOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [work, setWork] = useState<SorSochWork | null>(null);
  const [currentWorkId, setCurrentWorkId] = useState<string | null>(null);
  const [onlineMeta, setOnlineMeta] = useState<SorOnlineMeta | null>(null);
  const [activeTab, setActiveTab] = useState<"v1" | "v2" | "keys" | "rubric">("v1");
  const [recent, setRecent] = useState<Array<{ id: string; work: SorSochWork; online?: SorOnlineMeta | null }>>([]);
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "https://ksp-app-pi.vercel.app",
  );

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ai/sor-soch", { cache: "no-store" })
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{
              works?: Array<{ id: string; work: SorSochWork; online?: SorOnlineMeta | null }>;
            }>)
          : null,
      )
      .then((data) => {
        if (!cancelled && data?.works) setRecent(data.works);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function fetchGosoObjectives() {
    setLoadingGoso(true);
    try {
      const qs = new URLSearchParams({
        subject,
        grade: String(grade),
      });
      const res = await fetch(`/api/objectives?${qs.toString()}`);
      const data = (await res.json().catch(() => ({}))) as { objectives?: ObjectiveItem[] };
      setGosoOptions((data.objectives ?? []).slice(0, 40));
    } finally {
      setLoadingGoso(false);
    }
  }

  function toggleObjective(item: ObjectiveItem) {
    const line = `${item.code} ${(workLang === "kz" ? item.text_kz : item.text_ru) || item.text_ru || ""}`.trim();
    const lines = objectivesText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.some((l) => l.startsWith(item.code))) {
      setObjectivesText(lines.filter((l) => !l.startsWith(item.code)).join("\n"));
    } else {
      setObjectivesText([...lines, line].slice(0, 8).join("\n"));
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const learningObjectives = objectivesText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/ai/sor-soch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          grade,
          quarter,
          workType,
          language: workLang,
          maxPoints,
          durationMinutes,
          taskCount,
          sectionOrTopic,
          learningObjectives,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        work?: SorSochWork;
        error?: string;
      };
      if (!res.ok || !data.work) {
        throw new Error(data.error || "Ошибка генерации СОР/СОЧ");
      }
      setWork(data.work);
      setCurrentWorkId(data.id ?? null);
      setOnlineMeta(null);
      setActiveTab("v1");
      if (data.id) {
        setRecent((prev) => [{ id: data.id!, work: data.work!, online: null }, ...prev.slice(0, 9)]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось разработать СОР/СОЧ");
    } finally {
      setGenerating(false);
    }
  }

  async function handleIssueOnline() {
    if (!work || issuingOnline) return;
    setIssuingOnline(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/sor-soch/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(currentWorkId ? { workId: currentWorkId } : {}),
          work,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        workId?: string;
        online?: SorOnlineMeta;
        error?: string;
      };
      if (!res.ok || !data.online) {
        throw new Error(data.error || "Не удалось создать онлайн-коды");
      }
      if (data.workId) setCurrentWorkId(data.workId);
      setOnlineMeta(data.online);
      setRecent((prev) =>
        prev.map((item) =>
          item.id === (data.workId ?? currentWorkId) ? { ...item, online: data.online } : item,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выдать СОР/СОЧ онлайн");
    } finally {
      setIssuingOnline(false);
    }
  }

  async function handleDownloadDocx() {
    if (!work) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/export/sor-soch-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(work),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${work.workType} - ${work.subject} - ${work.grade}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-12">
      <Card className="md:col-span-5">
        <CardHeader>
          <CardTitle className="text-base">{L.formTitle}</CardTitle>
          <CardDescription>{L.formDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3.5 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">{L.subject}</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">{L.grade}</label>
              <select
                value={grade}
                onChange={(e) => setGrade(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border bg-background px-2.5 py-2 text-sm"
              >
                {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">{L.quarter}</label>
              <select
                value={quarter}
                onChange={(e) => setQuarter(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border bg-background px-2 py-2 text-sm"
              >
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">{L.workType}</label>
              <select
                value={workType}
                onChange={(e) => setWorkType(e.target.value)}
                className="mt-1 w-full rounded-lg border bg-background px-2 py-2 text-sm"
              >
                <option value="СОР №1">СОР №1 / БЖБ №1</option>
                <option value="СОР №2">СОР №2 / БЖБ №2</option>
                <option value="СОР №3">СОР №3 / БЖБ №3</option>
                <option value="СОЧ">СОЧ / ТЖБ</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">{L.language}</label>
              <select
                value={workLang}
                onChange={(e) => setWorkLang(e.target.value as "ru" | "kz")}
                className="mt-1 w-full rounded-lg border bg-background px-2 py-2 text-sm"
              >
                <option value="ru">Русский</option>
                <option value="kz">Қазақша</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">{L.maxPoints}</label>
              <input
                type="number"
                min={5}
                max={50}
                value={maxPoints}
                onChange={(e) => setMaxPoints(Number(e.target.value) || 15)}
                className="mt-1 w-full rounded-lg border bg-background px-2.5 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">{L.duration}</label>
              <input
                type="number"
                min={15}
                max={90}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value) || 25)}
                className="mt-1 w-full rounded-lg border bg-background px-2.5 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">{L.taskCount}</label>
              <select
                value={taskCount}
                onChange={(e) => setTaskCount(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border bg-background px-2 py-2 text-sm"
              >
                {[3, 4, 5, 6, 7].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">{L.sectionLabel}</label>
            <input
              type="text"
              value={sectionOrTopic}
              onChange={(e) => setSectionOrTopic(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-muted-foreground">
                {L.selectedObjectives}
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void fetchGosoObjectives()}
                disabled={loadingGoso}
                className="h-7 text-xs"
              >
                {loadingGoso ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
                {L.loadGoso}
              </Button>
            </div>
            <textarea
              rows={3}
              value={objectivesText}
              onChange={(e) => setObjectivesText(e.target.value)}
              className="mt-1.5 w-full rounded-lg border bg-background p-2.5 text-xs"
            />

            {gosoOptions.length > 0 && (
              <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2 text-xs">
                {gosoOptions.map((item) => {
                  const selected = objectivesText.includes(item.code);
                  return (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => toggleObjective(item)}
                      className={`flex w-full items-start gap-1.5 rounded px-2 py-1 text-left transition-colors ${
                        selected ? "bg-primary/15 font-medium text-primary" : "hover:bg-muted"
                      }`}
                    >
                      <Check
                        className={`mt-0.5 size-3 shrink-0 ${selected ? "opacity-100" : "opacity-0"}`}
                      />
                      <span>
                        <strong>{item.code}</strong>{" "}
                        {(workLang === "kz" ? item.text_kz : item.text_ru) || item.text_ru}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating || !subject.trim()}
            className="w-full gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 font-semibold text-white shadow-lg hover:opacity-90"
          >
            {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {generating ? L.generatingBtn : L.generateBtn}
          </Button>
          {error && <p className="text-xs text-rose-500">{error}</p>}

          {recent.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{L.recentWorks}</p>
              <div className="flex flex-wrap gap-1.5">
                {recent.slice(0, 5).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setWork(r.work);
                      setCurrentWorkId(r.id);
                      setOnlineMeta(r.online ?? null);
                      setActiveTab("v1");
                    }}
                    className="rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] hover:bg-muted"
                  >
                    {r.work.workType} · {r.work.subject} ({r.work.grade})
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="flex flex-col md:col-span-7">
        <CardHeader className="flex flex-wrap flex-row items-center justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base">{work ? work.title : L.previewTitle}</CardTitle>
            {work && (
              <CardDescription>
                {work.durationMinutes} мин · {work.maxPoints} б. · Знание{" "}
                {work.thinkingLevels.knowledgePercent}% / Применение{" "}
                {work.thinkingLevels.applicationPercent}% / НВП{" "}
                {work.thinkingLevels.higherOrderPercent}%
              </CardDescription>
            )}
          </div>
          {work && (
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void handleIssueOnline()}
                disabled={issuingOnline}
                className="gap-1.5 text-xs"
              >
                {issuingOnline ? <Loader2 className="size-3.5 animate-spin" /> : <QrCode className="size-3.5" />}
                {locale === "kk" ? "Онлайн кодпен беру (1 және 2 нұсқа)" : "Провести онлайн по коду"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleDownloadDocx()}
                disabled={downloading}
                className="gap-1.5 text-xs"
              >
                {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                {L.downloadDocx}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="gap-1.5 text-xs"
              >
                <Printer className="size-3.5" /> {L.printBtn}
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent className="flex-1 space-y-4">
          {work && onlineMeta && (
            <div className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3.5 sm:grid-cols-2">
              {(
                [
                  {
                    label: locale === "kk" ? "1-нұсқа" : "Вариант 1",
                    code: onlineMeta.v1Code,
                    id: onlineMeta.v1Id,
                  },
                  {
                    label: locale === "kk" ? "2-нұсқа" : "Вариант 2",
                    code: onlineMeta.v2Code,
                    id: onlineMeta.v2Id,
                  },
                ] as const
              ).map((v) => {
                const url = `${origin}/a/${v.code}`;
                const shareText = homeworkShareMessage({
                  title: `${work.title} (${v.label})`,
                  url,
                  code: v.code,
                  locale,
                });
                return (
                  <div
                    key={v.code}
                    className="space-y-2 rounded-lg border border-border bg-background p-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-primary">{v.label}</span>
                      <Link
                        href={`/assignments/${v.id}`}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground underline"
                      >
                        {locale === "kk" ? "Нәтижелер" : "Результаты"}
                        <ExternalLink className="size-3" />
                      </Link>
                    </div>
                    <div className="font-mono text-base font-bold tracking-wider">
                      /a/{v.code}
                    </div>
                    <ShareQrActions
                      url={url}
                      title={`${work.title} — ${v.label}`}
                      code={v.code}
                      shareText={shareText}
                      locale={locale}
                      compact
                    />
                  </div>
                );
              })}
            </div>
          )}
          {!work && !generating && (
            <div className="grid h-80 place-items-center text-center text-muted-foreground">
              <div className="max-w-md space-y-2">
                <FileCheck2 className="mx-auto size-10 opacity-30" />
                <p className="text-sm font-medium">{L.emptyTitle}</p>
                <p className="text-xs text-muted-foreground/80">{L.emptyHint}</p>
              </div>
            </div>
          )}

          {generating && (
            <div className="grid h-80 place-items-center text-center text-muted-foreground">
              <div className="space-y-3">
                <Loader2 className="mx-auto size-8 animate-spin text-violet-500" />
                <p className="text-sm font-medium">{L.generatingBtn}</p>
              </div>
            </div>
          )}

          {work && !generating && (
            <>
              <div className="flex flex-wrap gap-1.5 border-b border-border pb-2.5">
                {(
                  [
                    ["v1", L.tabV1],
                    ["v2", L.tabV2],
                    ["keys", L.tabKeys],
                    ["rubric", L.tabRubric],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      activeTab === key
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {(activeTab === "v1" || activeTab === "v2") && (
                <div className="max-h-[580px] space-y-3 overflow-y-auto pr-1 text-sm">
                  {(activeTab === "v1" ? work.variant1 : work.variant2).map((t) => (
                    <div key={t.number} className="rounded-xl border border-border bg-muted/25 p-4">
                      <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-primary">
                        <span>
                          №{t.number} ·{" "}
                          {t.level === "knowledge"
                            ? "Знание и понимание"
                            : t.level === "application"
                              ? "Применение"
                              : "Навыки высокого порядка"}
                        </span>
                        <span>[{t.points} б.]</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">
                        <MathText text={t.prompt} />
                      </p>
                      {t.options && t.options.length > 0 && (
                        <ul className="mt-2 space-y-1 pl-4 text-xs">
                          {t.options.map((opt, idx) => (
                            <li key={idx}>
                              <strong>{"АБВГДЕ"[idx] ?? idx + 1})</strong>{" "}
                              <MathText text={opt} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "keys" && (
                <div className="max-h-[580px] overflow-x-auto overflow-y-auto rounded-xl border border-border">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/60">
                        <th className="p-2.5">№</th>
                        <th className="p-2.5">Критерий</th>
                        <th className="p-2.5">Дескрипторы</th>
                        <th className="p-2.5 text-center">Балл</th>
                        <th className="p-2.5">Ключи (I / II)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {work.descriptors.map((d) => (
                        <tr key={d.taskNumber} className="border-b border-border last:border-0">
                          <td className="p-2.5 font-bold">{d.taskNumber}</td>
                          <td className="p-2.5">
                            <MathText text={d.criterion} />
                          </td>
                          <td className="p-2.5">
                            <ul className="list-disc space-y-0.5 pl-4">
                              {d.steps.map((st, idx) => (
                                <li key={idx}>
                                  <MathText text={st} />
                                </li>
                              ))}
                            </ul>
                          </td>
                          <td className="p-2.5 text-center font-bold">{d.points}</td>
                          <td className="space-y-1 p-2.5">
                            <div>
                              <strong>I:</strong> <MathText text={d.answerVariant1} />
                            </div>
                            <div>
                              <strong>II:</strong> <MathText text={d.answerVariant2} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === "rubric" && (
                <div className="max-h-[580px] overflow-x-auto overflow-y-auto rounded-xl border border-border">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/60">
                        <th className="p-2.5">Критерий</th>
                        <th className="p-2.5">Низкий уровень</th>
                        <th className="p-2.5">Средний уровень</th>
                        <th className="p-2.5">Высокий уровень</th>
                      </tr>
                    </thead>
                    <tbody>
                      {work.rubric.map((r, idx) => (
                        <tr key={idx} className="border-b border-border last:border-0">
                          <td className="p-2.5 font-semibold">{r.criterion}</td>
                          <td className="p-2.5">{r.low}</td>
                          <td className="p-2.5">{r.medium}</td>
                          <td className="p-2.5">{r.high}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
