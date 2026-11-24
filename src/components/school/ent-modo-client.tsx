"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Award,
  BookOpenCheck,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  GraduationCap,
  Loader2,
  Printer,
  QrCode,
  RotateCcw,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MathText } from "@/lib/math/render-math";
import { ShareQrActions } from "@/components/share/share-toolbar";
import { homeworkShareMessage } from "@/lib/share/messengers";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import {
  evaluateEntModoAttempt,
  type EntModoWork,
  type ExamKind,
  type TrainerAnswersState,
} from "@/lib/ai/ent-modo-models";

interface ObjectiveItem {
  code: string;
  text_ru?: string;
  text_kz?: string | null;
}

interface OnlineAssignMeta {
  assignmentId: string;
  code: string;
  issuedAt: string;
}

const PRESETS: Record<ExamKind, { grade: number; subjectsRu: string[]; subjectsKz: string[] }> = {
  modo_4: {
    grade: 4,
    subjectsRu: [
      "Грамотность чтения",
      "Математическая грамотность",
      "Естественнонаучная грамотность",
      "Математика",
      "Русский язык",
      "Естествознание",
    ],
    subjectsKz: [
      "Оқу сауаттылығы",
      "Математикалық сауаттылық",
      "Жаратылыстану-ғылыми сауаттылық",
      "Математика",
      "Қазақ тілі",
      "Жаратылыстану",
    ],
  },
  modo_9: {
    grade: 9,
    subjectsRu: [
      "Грамотность чтения",
      "Математическая грамотность",
      "Естественнонаучная грамотность",
      "Алгебра",
      "Физика",
      "Химия",
      "Биология",
      "География",
      "История Казахстана",
      "Информатика",
    ],
    subjectsKz: [
      "Оқу сауаттылығы",
      "Математикалық сауаттылық",
      "Жаратылыстану-ғылыми сауаттылық",
      "Алгебра",
      "Физика",
      "Химия",
      "Биология",
      "География",
      "Қазақстан тарихы",
      "Информатика",
    ],
  },
  ent_11: {
    grade: 11,
    subjectsRu: [
      "История Казахстана",
      "Математическая грамотность",
      "Грамотность чтения",
      "Математика",
      "Информатика",
      "Физика",
      "Химия",
      "Биология",
      "География",
      "Всемирная история",
      "Английский язык",
      "Основы права",
    ],
    subjectsKz: [
      "Қазақстан тарихы",
      "Математикалық сауаттылық",
      "Оқу сауаттылығы",
      "Математика",
      "Информатика",
      "Физика",
      "Химия",
      "Биология",
      "География",
      "Дүниежүзі тарихы",
      "Ағылшын тілі",
      "Құқық негіздері",
    ],
  },
};

const LETTERS_4 = ["A", "B", "C", "D"] as const;
const LETTERS_6 = ["A", "B", "C", "D", "E", "F"] as const;

export function EntModoClient() {
  const { locale } = useUiLocale();
  const isKk = locale === "kk";

  const [examKind, setExamKind] = useState<ExamKind>("ent_11");
  const [grade, setGrade] = useState<number>(11);
  const [subject, setSubject] = useState<string>(isKk ? "Қазақстан тарихы" : "История Казахстана");
  const [workLang, setWorkLang] = useState<"ru" | "kz">(isKk ? "kz" : "ru");
  const [partACount, setPartACount] = useState<number>(8);
  const [contextCount, setContextCount] = useState<number>(4);
  const [partCCount, setPartCCount] = useState<number>(3);
  const [topicFocus, setTopicFocus] = useState<string>("");
  const [objectivesText, setObjectivesText] = useState<string>("");

  const [gosoOptions, setGosoOptions] = useState<ObjectiveItem[]>([]);
  const [loadingGoso, setLoadingGoso] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [issuingOnline, setIssuingOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [work, setWork] = useState<EntModoWork | null>(null);
  const [workId, setWorkId] = useState<string | null>(null);
  const [onlineMeta, setOnlineMeta] = useState<OnlineAssignMeta | null>(null);
  const [recent, setRecent] = useState<
    Array<{ id: string; work: EntModoWork; online?: OnlineAssignMeta | null }>
  >([]);

  const [activeTab, setActiveTab] = useState<"trainer" | "sheet" | "online">("trainer");
  const [answers, setAnswers] = useState<TrainerAnswersState>({ single: {}, multi: {} });
  const [checked, setChecked] = useState(false);

  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "https://ksp-app-pi.vercel.app",
  );

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ai/ent-modo", { cache: "no-store" })
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{
              works?: Array<{ id: string; work: EntModoWork; online?: OnlineAssignMeta | null }>;
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

  function selectExamKind(next: ExamKind) {
    setExamKind(next);
    const preset = PRESETS[next];
    setGrade(preset.grade);
    const list = workLang === "kz" ? preset.subjectsKz : preset.subjectsRu;
    setSubject(list[0] ?? "Математика");
    if (next !== "ent_11") {
      setPartCCount(0);
    } else if (partCCount === 0) {
      setPartCCount(3);
    }
  }

  async function loadGoso() {
    setLoadingGoso(true);
    try {
      const qs = new URLSearchParams({ subject, grade: String(grade) });
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
      setObjectivesText([...lines, line].slice(0, 10).join("\n"));
    }
  }

  function resetTrainer() {
    setAnswers({ single: {}, multi: {} });
    setChecked(false);
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const learningObjectives = objectivesText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/ai/ent-modo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examKind,
          subject,
          grade,
          language: workLang,
          partACount,
          contextCount,
          partCCount: examKind === "ent_11" ? partCCount : 0,
          topicFocus,
          learningObjectives,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        work?: EntModoWork;
        error?: string;
      };
      if (!res.ok || !data.work) {
        throw new Error(data.error || "Ошибка генерации варианта");
      }
      setWork(data.work);
      setWorkId(data.id ?? null);
      setOnlineMeta(null);
      resetTrainer();
      setActiveTab("trainer");
      if (data.id) {
        setRecent((prev) => [{ id: data.id!, work: data.work!, online: null }, ...prev.slice(0, 9)]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сформировать вариант");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownloadDocx() {
    if (!work) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/export/ent-modo-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(work),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${work.examKind.toUpperCase()} - ${work.subject} - ${work.grade}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  async function handleIssueOnline() {
    if (!work || issuingOnline) return;
    setIssuingOnline(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/ent-modo/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(workId ? { workId } : {}),
          work,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        workId?: string;
        online?: OnlineAssignMeta;
        error?: string;
      };
      if (!res.ok || !data.online) {
        throw new Error(data.error || "Не удалось выдать вариант онлайн");
      }
      if (data.workId) setWorkId(data.workId);
      setOnlineMeta(data.online);
      setActiveTab("online");
      setRecent((prev) =>
        prev.map((item) =>
          item.id === (data.workId ?? workId) ? { ...item, online: data.online } : item,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка выдачи");
    } finally {
      setIssuingOnline(false);
    }
  }

  function pickSingle(num: number, idx: number) {
    if (checked) return;
    setAnswers((prev) => ({
      ...prev,
      single: { ...prev.single, [num]: idx },
    }));
  }

  function toggleMulti(num: number, idx: number) {
    if (checked) return;
    setAnswers((prev) => {
      const cur = prev.multi[num] ?? [];
      if (cur.includes(idx)) {
        return { ...prev, multi: { ...prev.multi, [num]: cur.filter((x) => x !== idx) } };
      }
      if (cur.length >= 3) return prev; // По правилам НЦТ РК выбирается не более 3 ответов
      return { ...prev, multi: { ...prev.multi, [num]: [...cur, idx].sort((a, b) => a - b) } };
    });
  }

  const evaluation = work && checked ? evaluateEntModoAttempt(work, answers) : null;
  const presetList = workLang === "kz" ? PRESETS[examKind].subjectsKz : PRESETS[examKind].subjectsRu;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6">
      <header className="space-y-2">
        <p className="editorial-kicker text-amber-400">
          {isKk ? "ҰБТ және ББЖМ дайындық орталығы" : "Национальное тестирование РК (НЦТ)"}
        </p>
        <h1 className="editorial-display text-3xl font-bold">
          {isKk
            ? "ҰБТ және ББЖМ тренажері мен нұсқа генераторы (4, 9, 11-сынып)"
            : "Тренажёр и генератор вариантов ЕНТ и МОДО (4, 9, 11 классы)"}
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {isKk
            ? "МЖМБС оқу мақсаттарына байланысты 1 жауаптық, контекстік және көп таңдаулы (0/1/2 балл) тапсырмаларды құрастырыңыз, экранда жаттығыңыз, Word-қа жүктеңіз немесе сыныпқа QR-кодпен беріңіз."
            : "Создавайте варианты по формату НЦТ РК (одиночный выбор, контекстный блок и множественный выбор с оцениванием 0/1/2 балла), решайте в интерактивном тренажёре, скачивайте Word со спецификацией ГОСО или выдавайте классу по QR."}
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-12">
        {/* Левая колонка: конструктор варианта */}
        <Card className="md:col-span-5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {isKk ? "Емтихан параметрлері" : "Параметры экзаменационного варианта"}
            </CardTitle>
            <CardDescription>
              {isKk ? "Формат пен бағытты таңдаңыз" : "Формат НЦТ РК с привязкой к целям ГОСО"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5 text-sm">
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ["modo_4", isKk ? "ББЖМ 4-сын." : "МОДО 4 кл."],
                  ["modo_9", isKk ? "ББЖМ 9-сын." : "МОДО 9 кл."],
                  ["ent_11", isKk ? "ҰБТ 10–11" : "ЕНТ 10–11"],
                ] as const
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => selectExamKind(kind)}
                  className={`rounded-xl border px-2.5 py-2 text-xs font-bold transition-colors ${
                    examKind === kind
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {isKk ? "Сауаттылық бағыты / бейіндік пән" : "Грамотность / профильный предмет"}
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
              <div className="mt-1.5 flex flex-wrap gap-1">
                {presetList.slice(0, 6).map((sName) => (
                  <button
                    key={sName}
                    type="button"
                    onClick={() => setSubject(sName)}
                    className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
                      subject === sName
                        ? "bg-primary/20 font-semibold text-primary"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {sName}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  {isKk ? "Сынып" : "Класс"}
                </label>
                <select
                  value={grade}
                  onChange={(e) => setGrade(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border bg-background px-2.5 py-2 text-sm"
                >
                  {(examKind === "modo_4" ? [4] : examKind === "modo_9" ? [9] : [10, 11]).map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  {isKk ? "Тапсырма тілі" : "Язык варианта"}
                </label>
                <select
                  value={workLang}
                  onChange={(e) => setWorkLang(e.target.value as "ru" | "kz")}
                  className="mt-1 w-full rounded-lg border bg-background px-2.5 py-2 text-sm"
                >
                  <option value="ru">Русский</option>
                  <option value="kz">Қазақша</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">
                  {isKk ? "А бөлімі (1 жауап)" : "Часть А (1 из 4)"}
                </label>
                <select
                  value={partACount}
                  onChange={(e) => setPartACount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
                >
                  {[5, 8, 10, 12, 15].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">
                  {isKk ? "Контекст сұрағы" : "Контекст (Б)"}
                </label>
                <select
                  value={contextCount}
                  onChange={(e) => setContextCount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
                >
                  {[3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">
                  {isKk ? "С бөлімі (2 б.)" : "Часть В (из 6)"}
                </label>
                <select
                  value={examKind === "ent_11" ? partCCount : 0}
                  disabled={examKind !== "ent_11"}
                  onChange={(e) => setPartCCount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
                >
                  {[0, 2, 3, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {isKk ? "Тақырыптық акцент (міндетті емес)" : "Уточнение тем (необязательно)"}
              </label>
              <input
                type="text"
                value={topicFocus}
                onChange={(e) => setTopicFocus(e.target.value)}
                placeholder={
                  isKk
                    ? "Мысалы: Квадрат теңдеулер, функция графигі"
                    : "Напр.: Казахское ханство XV–XVII вв., работа с картами"
                }
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  {isKk ? "МЖМБС оқу мақсаттары" : "Цели обучения ГОСО"}
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void loadGoso()}
                  disabled={loadingGoso}
                  className="h-7 text-xs"
                >
                  {loadingGoso ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
                  {isKk ? "МЖМБС-тан табу" : "Найти в ГОСО"}
                </Button>
              </div>
              <textarea
                rows={2}
                value={objectivesText}
                onChange={(e) => setObjectivesText(e.target.value)}
                placeholder={
                  isKk
                    ? "Бос қалдырсаңыз — ЖИ бағдарлама бойынша өзі таңдайды"
                    : "Оставьте пустым для автоподбора по ГОСО или выберите ниже"
                }
                className="mt-1 w-full rounded-lg border bg-background p-2 text-xs"
              />
              {gosoOptions.length > 0 && (
                <div className="mt-1.5 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2 text-xs">
                  {gosoOptions.map((item) => {
                    const selected = objectivesText.includes(item.code);
                    return (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => toggleObjective(item)}
                        className={`flex w-full items-start gap-1.5 rounded px-2 py-1 text-left ${
                          selected ? "bg-primary/15 font-medium text-primary" : "hover:bg-muted"
                        }`}
                      >
                        <Check className={`mt-0.5 size-3 shrink-0 ${selected ? "opacity-100" : "opacity-0"}`} />
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
              className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-600 font-semibold text-white shadow-lg hover:opacity-90"
            >
              {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {generating
                ? isKk
                  ? "Нұсқа құрастырылуда…"
                  : "ИИ формирует вариант и ключи…"
                : isKk
                  ? "Нұсқа құрастыру"
                  : "Сгенерировать вариант"}
            </Button>

            {error && <p className="text-xs text-rose-500">{error}</p>}

            {recent.length > 0 && (
              <div className="border-t border-border pt-3">
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                  {isKk ? "Соңғы нұсқалар:" : "Сохранённые варианты:"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {recent.slice(0, 5).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setWork(r.work);
                        setWorkId(r.id);
                        setOnlineMeta(r.online ?? null);
                        resetTrainer();
                        setActiveTab("trainer");
                      }}
                      className="rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] hover:bg-muted"
                    >
                      {r.work.examKind === "ent_11" ? "ЕНТ" : "МОДО"} · {r.work.subject} ({r.work.grade})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Правая колонка: Тренажёр / Лист с ключами / Онлайн-выдача */}
        <Card className="flex flex-col md:col-span-7">
          <CardHeader className="flex flex-wrap flex-row items-center justify-between gap-2 pb-3">
            <div>
              <CardTitle className="text-base">
                {work ? work.title : isKk ? "Интерактивті тренажер" : "Интерактивный тренажёр и спецификация"}
              </CardTitle>
              {work && (
                <CardDescription>
                  {work.durationMinutes} {isKk ? "мин" : "мин"} · {work.maxPoints}{" "}
                  {isKk ? "балл" : "баллов"} ·{" "}
                  {work.partA.length + work.contextBlock.questions.length + work.partC.length}{" "}
                  {isKk ? "сұрақ" : "заданий"}
                </CardDescription>
              )}
            </div>
            {work && (
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleDownloadDocx()}
                  disabled={downloading}
                  className="gap-1.5 text-xs"
                >
                  {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                  Word (.docx)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="gap-1.5 text-xs"
                >
                  <Printer className="size-3.5" />
                  {isKk ? "Басып шығару" : "Печать"}
                </Button>
              </div>
            )}
          </CardHeader>

          <CardContent className="flex-1 space-y-4">
            {!work && !generating && (
              <div className="grid h-80 place-items-center text-center text-muted-foreground">
                <div className="max-w-md space-y-2">
                  <GraduationCap className="mx-auto size-11 opacity-30" />
                  <p className="text-sm font-medium">
                    {isKk
                      ? "ҰБТ немесе ББЖМ нұсқасы осында ашылады"
                      : "Выберите формат (МОДО 4/9 или ЕНТ 10–11) и нажмите «Сгенерировать вариант»"}
                  </p>
                  <p className="text-xs text-muted-foreground/80">
                    {isKk
                      ? "Оқушылармен тақтада бірге талдауға, Word парағын басып шығаруға немесе телефоннан QR арқылы орындатуға болады."
                      : "Можно прорешать вариант прямо на интерактивной доске с мгновенным разбором, скачать готовый .docx или раздать ученикам на телефоны по коду."}
                  </p>
                </div>
              </div>
            )}

            {generating && (
              <div className="grid h-80 place-items-center text-center text-muted-foreground">
                <div className="space-y-3">
                  <Loader2 className="mx-auto size-8 animate-spin text-amber-500" />
                  <p className="text-sm font-medium">
                    {isKk ? "ЖИ тапсырмалар мен контекстік мәтінді дайындауда…" : "ИИ разрабатывает тестовые задания, контекст и ключи…"}
                  </p>
                </div>
              </div>
            )}

            {work && !generating && (
              <>
                <div className="flex flex-wrap gap-1.5 border-b border-border pb-2.5">
                  {(
                    [
                      ["trainer", isKk ? "Тренажер режимі" : "Интерактивный тренажёр", BookOpenCheck],
                      ["sheet", isKk ? "Кілттер мен МЖМБС" : "Ключи и спецификация ГОСО", Award],
                      ["online", isKk ? "Сыныпқа онлайн беру (QR)" : "Выдать классу онлайн (QR)", QrCode],
                    ] as const
                  ).map(([key, label, Icon]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveTab(key)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        activeTab === key
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="size-3.5" />
                      {label}
                    </button>
                  ))}
                </div>

                {activeTab === "trainer" && (
                  <div className="space-y-4">
                    {evaluation && (
                      <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold uppercase text-amber-500">
                              {isKk ? "Нәтиже" : "Результат проверки по шкале НЦТ РК"}
                            </p>
                            <p className="text-2xl font-bold">
                              {evaluation.score} / {evaluation.maxPoints}{" "}
                              <span className="text-base font-medium text-muted-foreground">
                                ({evaluation.percent}%)
                              </span>
                            </p>
                          </div>
                          <Button type="button" size="sm" variant="outline" onClick={resetTrainer}>
                            <RotateCcw className="size-3.5" />
                            {isKk ? "Қайта орындау" : "Решить заново"}
                          </Button>
                        </div>

                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold">
                            {isKk ? "МЖМБС мақсаттары бойынша меңгеру:" : "Освоение целей обучения ГОСО:"}
                          </p>
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {evaluation.byObjective.map((obj) => (
                              <div
                                key={obj.code}
                                className="flex items-center justify-between rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                              >
                                <span className="font-mono font-semibold">{obj.code}</span>
                                <span
                                  className={
                                    obj.percent >= 70
                                      ? "font-bold text-emerald-500"
                                      : obj.percent >= 40
                                        ? "font-bold text-amber-500"
                                        : "font-bold text-rose-500"
                                  }
                                >
                                  {obj.earned}/{obj.max} ({obj.percent}%)
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="max-h-[600px] space-y-4 overflow-y-auto pr-1 text-sm">
                      {/* Часть А */}
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {isKk ? "А бөлімі — Бір жауапты таңдау (1 балл)" : "Часть А — Выбор одного ответа из 4 (1 балл)"}
                      </p>
                      {work.partA.map((q) => {
                        const picked = answers.single[q.number];
                        const qRes = evaluation?.perQuestion[q.number];
                        return (
                          <div key={q.number} className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-4">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-primary">
                                №{q.number} {q.objectiveCode ? `· ${q.objectiveCode}` : ""}
                              </span>
                              <span className="text-muted-foreground">[1 б.]</span>
                            </div>
                            <p className="font-medium leading-relaxed">
                              <MathText text={q.prompt} />
                            </p>
                            <div className="grid gap-1.5">
                              {q.options.map((opt, idx) => {
                                const isPicked = picked === idx;
                                const isRight = q.correctIndex === idx;
                                const cls = checked
                                  ? isRight
                                    ? "border-emerald-500 bg-emerald-500/15 font-medium"
                                    : isPicked
                                      ? "border-rose-500 bg-rose-500/15"
                                      : "border-border opacity-75"
                                  : isPicked
                                    ? "border-primary bg-primary/10 font-medium"
                                    : "border-border hover:bg-muted";
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => pickSingle(q.number, idx)}
                                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${cls}`}
                                  >
                                    <span className="font-bold">{LETTERS_4[idx]})</span>
                                    <span className="flex-1">
                                      <MathText text={opt} />
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            {checked && qRes && (
                              <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-2.5 text-xs">
                                {qRes.isFull ? (
                                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                                ) : (
                                  <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />
                                )}
                                <div>
                                  <strong>
                                    {isKk ? "Дұрыс жауап:" : "Правильный ответ:"} {LETTERS_4[q.correctIndex]}
                                  </strong>
                                  {q.explanation && (
                                    <p className="mt-0.5 text-muted-foreground">
                                      <MathText text={q.explanation} />
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Часть Б — Контекст */}
                      <div className="space-y-2 rounded-xl border-l-4 border-indigo-500 bg-indigo-500/5 p-4">
                        <p className="text-xs font-bold uppercase text-indigo-400">
                          {isKk ? "В бөлімі — Контекст" : "Часть Б — Контекстное задание"}
                        </p>
                        <h4 className="font-bold">
                          <MathText text={work.contextBlock.title} />
                        </h4>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
                          <MathText text={work.contextBlock.passage} />
                        </p>
                      </div>

                      {work.contextBlock.questions.map((q) => {
                        const picked = answers.single[q.number];
                        const qRes = evaluation?.perQuestion[q.number];
                        return (
                          <div key={q.number} className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-4">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-indigo-400">
                                №{q.number} ({isKk ? "Контекст" : "По контексту"}) {q.objectiveCode ? `· ${q.objectiveCode}` : ""}
                              </span>
                              <span className="text-muted-foreground">[1 б.]</span>
                            </div>
                            <p className="font-medium leading-relaxed">
                              <MathText text={q.prompt} />
                            </p>
                            <div className="grid gap-1.5">
                              {q.options.map((opt, idx) => {
                                const isPicked = picked === idx;
                                const isRight = q.correctIndex === idx;
                                const cls = checked
                                  ? isRight
                                    ? "border-emerald-500 bg-emerald-500/15 font-medium"
                                    : isPicked
                                      ? "border-rose-500 bg-rose-500/15"
                                      : "border-border opacity-75"
                                  : isPicked
                                    ? "border-primary bg-primary/10 font-medium"
                                    : "border-border hover:bg-muted";
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => pickSingle(q.number, idx)}
                                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${cls}`}
                                  >
                                    <span className="font-bold">{LETTERS_4[idx]})</span>
                                    <span className="flex-1">
                                      <MathText text={opt} />
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            {checked && qRes && (
                              <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-2.5 text-xs">
                                {qRes.isFull ? (
                                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                                ) : (
                                  <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />
                                )}
                                <div>
                                  <strong>
                                    {isKk ? "Дұрыс жауап:" : "Правильный ответ:"} {LETTERS_4[q.correctIndex]}
                                  </strong>
                                  {q.explanation && (
                                    <p className="mt-0.5 text-muted-foreground">
                                      <MathText text={q.explanation} />
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Часть В — Множественный выбор */}
                      {work.partC.length > 0 && (
                        <>
                          <p className="pt-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            {isKk
                              ? "С бөлімі — Бір немесе бірнеше дұрыс жауап (1–3 жауап, макс. 2 балл)"
                              : "Часть В — Множественный выбор (от 1 до 3 верных из 6, макс. 2 балла)"}
                          </p>
                          {work.partC.map((q) => {
                            const picked = answers.multi[q.number] ?? [];
                            const qRes = evaluation?.perQuestion[q.number];
                            return (
                              <div
                                key={q.number}
                                className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-4"
                              >
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-bold text-amber-500">
                                    №{q.number} {q.objectiveCode ? `· ${q.objectiveCode}` : ""}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {isKk ? "1–3 жауап · [2 б.]" : "выберите до 3 · [2 б.]"}
                                  </span>
                                </div>
                                <p className="font-medium leading-relaxed">
                                  <MathText text={q.prompt} />
                                </p>
                                <div className="grid gap-1.5 sm:grid-cols-2">
                                  {q.options.map((opt, idx) => {
                                    const isPicked = picked.includes(idx);
                                    const isRight = q.correctIndices.includes(idx);
                                    const cls = checked
                                      ? isRight
                                        ? "border-emerald-500 bg-emerald-500/15 font-medium"
                                        : isPicked
                                          ? "border-rose-500 bg-rose-500/15"
                                          : "border-border opacity-75"
                                      : isPicked
                                        ? "border-amber-500 bg-amber-500/15 font-medium"
                                        : "border-border hover:bg-muted";
                                    return (
                                      <button
                                        key={idx}
                                        type="button"
                                        onClick={() => toggleMulti(q.number, idx)}
                                        className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${cls}`}
                                      >
                                        <span className="font-bold">{LETTERS_6[idx]})</span>
                                        <span className="flex-1">
                                          <MathText text={opt} />
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                                {checked && qRes && (
                                  <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-2.5 text-xs">
                                    {qRes.earned === 2 ? (
                                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                                    ) : (
                                      <XCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                                    )}
                                    <div>
                                      <strong>
                                        {isKk ? "Балл:" : "Набрано:"} {qRes.earned}/2 ·{" "}
                                        {isKk ? "Кілт:" : "Ключ:"}{" "}
                                        {q.correctIndices.map((i) => LETTERS_6[i]).join(", ")}
                                      </strong>
                                      {q.explanation && (
                                        <p className="mt-0.5 text-muted-foreground">
                                          <MathText text={q.explanation} />
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>

                    {!checked && (
                      <Button
                        type="button"
                        onClick={() => setChecked(true)}
                        className="w-full gap-2 font-semibold"
                      >
                        <CheckCircle2 className="size-4" />
                        {isKk ? "Жауаптарды тексеру (ҰТО шкаласы)" : "Проверить ответы и показать разбор"}
                      </Button>
                    )}
                  </div>
                )}

                {activeTab === "sheet" && (
                  <div className="max-h-[600px] overflow-x-auto overflow-y-auto rounded-xl border border-border">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/60">
                          <th className="p-2.5">№</th>
                          <th className="p-2.5">{isKk ? "Бөлім" : "Блок"}</th>
                          <th className="p-2.5">{isKk ? "МЖМБС коды" : "Код ГОСО"}</th>
                          <th className="p-2.5">{isKk ? "Кілт" : "Ключ"}</th>
                          <th className="p-2.5 text-center">{isKk ? "Балл" : "Балл"}</th>
                          <th className="p-2.5">{isKk ? "Түсіндірме" : "Пояснение"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {work.partA.map((q) => (
                          <tr key={q.number} className="border-b border-border">
                            <td className="p-2.5 font-bold">{q.number}</td>
                            <td className="p-2.5">A</td>
                            <td className="p-2.5 font-mono">{q.objectiveCode || "—"}</td>
                            <td className="p-2.5 font-bold text-primary">{LETTERS_4[q.correctIndex]}</td>
                            <td className="p-2.5 text-center">1</td>
                            <td className="p-2.5">
                              <MathText text={q.explanation || "—"} />
                            </td>
                          </tr>
                        ))}
                        {work.contextBlock.questions.map((q) => (
                          <tr key={q.number} className="border-b border-border">
                            <td className="p-2.5 font-bold">{q.number}</td>
                            <td className="p-2.5">{isKk ? "Контекст" : "Контекст (Б)"}</td>
                            <td className="p-2.5 font-mono">{q.objectiveCode || "—"}</td>
                            <td className="p-2.5 font-bold text-primary">{LETTERS_4[q.correctIndex]}</td>
                            <td className="p-2.5 text-center">1</td>
                            <td className="p-2.5">
                              <MathText text={q.explanation || "—"} />
                            </td>
                          </tr>
                        ))}
                        {work.partC.map((q) => (
                          <tr key={q.number} className="border-b border-border last:border-0">
                            <td className="p-2.5 font-bold">{q.number}</td>
                            <td className="p-2.5">C (1–3)</td>
                            <td className="p-2.5 font-mono">{q.objectiveCode || "—"}</td>
                            <td className="p-2.5 font-bold text-amber-500">
                              {q.correctIndices.map((i) => LETTERS_6[i]).join(", ")}
                            </td>
                            <td className="p-2.5 text-center">2</td>
                            <td className="p-2.5">
                              <MathText text={q.explanation || "—"} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeTab === "online" && (
                  <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-5 text-sm">
                    <div className="space-y-1">
                      <h3 className="font-bold">
                        {isKk
                          ? "Нұсқаны сыныпқа сілтеме және QR-код арқылы беру"
                          : "Выдать тренировочный вариант классу по коду и QR"}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {isKk
                          ? "Оқушылар тіркеусіз /a/[код] сілтемесімен телефоннан кіріп орындайды, ал нәтижелер кестесі автоматты түрде жиналады."
                          : "Ученики открывают /a/[код] на телефонах без регистрации, а их баллы автоматически собираются в вашей сводной ведомости и электронном журнале."}
                      </p>
                    </div>

                    {!onlineMeta ? (
                      <Button
                        type="button"
                        onClick={() => void handleIssueOnline()}
                        disabled={issuingOnline}
                        className="gap-2"
                      >
                        {issuingOnline ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
                        {isKk ? "Онлайн код пен QR жасау" : "Создать 6-значный код и QR для класса"}
                      </Button>
                    ) : (
                      <div className="space-y-3 rounded-xl border border-primary/30 bg-background p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="text-xs text-muted-foreground">
                              {isKk ? "Оқушыларға арналған сілтеме:" : "Ссылка и код для учеников:"}
                            </span>
                            <p className="font-mono text-xl font-bold text-primary">
                              {origin}/a/{onlineMeta.code}
                            </p>
                          </div>
                          <Link
                            href={`/assignments/${onlineMeta.assignmentId}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                          >
                            {isKk ? "Оқушылар нәтижелері" : "Открыть таблицу результатов"}
                            <ExternalLink className="size-3.5" />
                          </Link>
                        </div>

                        <ShareQrActions
                          url={`${origin}/a/${onlineMeta.code}`}
                          title={work.title}
                          code={onlineMeta.code}
                          shareText={homeworkShareMessage({
                            title: work.title,
                            url: `${origin}/a/${onlineMeta.code}`,
                            code: onlineMeta.code,
                            locale,
                          })}
                          locale={locale}
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
