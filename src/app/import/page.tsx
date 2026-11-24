"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileText,
  AlertTriangle,
  Check,
  Loader2,
  ArrowRight,
  X,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import type { KspContent, SubjectRow } from "@/lib/types/ksp";
import { savePlanAction } from "@/app/actions/plans";

interface DetectedMeta {
  grade: number;
  quarter: number | null;
  language: "ru" | "kz";
  subjectName: string | null;
  subjectId: string | null;
  section: string | null;
}

type ParseState =
  | { status: "idle" }
  | { status: "parsing" }
  | { status: "done"; content: KspContent; subjects: SubjectRow[]; detected: DetectedMeta }
  | { status: "error"; message: string };

const COPY = {
  ru: {
    kicker: "Импорт",
    title: "Импорт КСП из Word",
    lead: "Загрузите .docx файл с планом урока — мы автоматически определим предмет, класс, четверть и язык плана, а вы сможете проверить всё перед сохранением.",
    onlyDocx: "Поддерживаются только файлы .docx",
    tooLarge: "Файл больше 10 МБ",
    parseError: "Ошибка при обработке файла",
    networkError: "Не удалось обработать файл. Попробуйте ещё раз.",
    parsing: "Обрабатываем файл…",
    dropTitle: "Перетащите .docx файл сюда",
    dropSub: "или нажмите, чтобы выбрать файл",
    dropLimit: "Поддерживаются файлы до 10 МБ",
    doneTitle: "Документ успешно обработан",
    doneSub: "Проверьте автоопределённые параметры и структуру урока перед импортом",
    otherFile: "Другой файл",
    cancel: "Отмена",
    importBtn: "Импортировать как новый КСП",
    metaCardTitle: "Параметры сохранения КСП",
    autoBadge: "Автоопределено из документа",
    planTitle: "Тема / название КСП",
    subjectLabel: "Предмет",
    subjectNone: "— Не выбран —",
    detectedSubjectHint: "В документе найден предмет:",
    gradeLabel: "Класс",
    gradeSuffix: "класс",
    quarterLabel: "Четверть",
    quarterNone: "Не указана",
    quarterSuffix: "четверть",
    langLabel: "Язык плана",
    langRu: "Русский",
    langKz: "Қазақша (казахский)",
    sectionLabel: "Раздел долгосрочного плана",
    defaultTitle: "Импортированный КСП",
    infoCard: "Основная информация из шапки",
    topicField: "Тема урока",
    schoolField: "Школа",
    teacherField: "Учитель",
    gradeField: "Класс (в шапке)",
    dateField: "Дата",
    sectionField: "Раздел ДП",
    learningObjTitle: "Цели обучения",
    lessonObjTitle: "Цели урока",
    flowTitle: "Ход урока",
    stageBeg: "Начало урока",
    stageMid: "Середина урока",
    stageEnd: "Конец урока",
    teacherAct: "Действия педагога",
    studentAct: "Действия ученика",
    resources: "Ресурсы",
    assessment: "Оценивание",
  },
  kk: {
    kicker: "Импорт",
    title: "Word-тан ҚМЖ импорттау",
    lead: "Сабақ жоспары бар .docx файлын жүктеңіз — біз пәнді, сыныпты, тоқсанды және жоспар тілін автоматты түрде анықтаймыз, ал сіз сақтау алдында тексере аласыз.",
    onlyDocx: "Тек .docx файлдары қолдау табады",
    tooLarge: "Файл 10 МБ-тан үлкен",
    parseError: "Файлды өңдеу қатесі",
    networkError: "Файлды өңдеу мүмкін болмады. Қайтадан көріңіз.",
    parsing: "Файл өңделуде…",
    dropTitle: ".docx файлын осында сүйреңіз",
    dropSub: "немесе файлды таңдау үшін басыңыз",
    dropLimit: "10 МБ-қа дейінгі файлдар қолдау табады",
    doneTitle: "Құжат сәтті өңделді",
    doneSub: "Импорттау алдында автоматты анықталған параметрлер мен сабақ құрылымын тексеріңіз",
    otherFile: "Басқа файл",
    cancel: "Бас тарту",
    importBtn: "Жаңа ҚМЖ ретінде сақтау",
    metaCardTitle: "ҚМЖ сақтау параметрлері",
    autoBadge: "Құжаттан автоматты анықталды",
    planTitle: "Сабақ тақырыбы / ҚМЖ атауы",
    subjectLabel: "Пән",
    subjectNone: "— Таңдалмаған —",
    detectedSubjectHint: "Құжаттан табылған пән:",
    gradeLabel: "Сынып",
    gradeSuffix: "сынып",
    quarterLabel: "Тоқсан",
    quarterNone: "Көрсетілмеген",
    quarterSuffix: "тоқсан",
    langLabel: "Жоспар тілі",
    langRu: "Орысша",
    langKz: "Қазақша",
    sectionLabel: "Ұзақ мерзімді жоспар бөлімі",
    defaultTitle: "Импортталған ҚМЖ",
    infoCard: "Тақырыпшадағы негізгі мәліметтер",
    topicField: "Сабақ тақырыбы",
    schoolField: "Мектеп",
    teacherField: "Мұғалім",
    gradeField: "Сынып (құжатта)",
    dateField: "Күні",
    sectionField: "ҰМЖ бөлімі",
    learningObjTitle: "Оқу мақсаттары",
    lessonObjTitle: "Сабақ мақсаттары",
    flowTitle: "Сабақ барысы",
    stageBeg: "Сабақ басы",
    stageMid: "Сабақ ортасы",
    stageEnd: "Сабақ соңы",
    teacherAct: "Мұғалім әрекеттері",
    studentAct: "Оқушы әрекеттері",
    resources: "Ресурстар",
    assessment: "Бағалау",
  },
} as const;

export default function ImportPage() {
  const router = useRouter();
  const { locale } = useUiLocale();
  const c = COPY[locale];
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parseState, setParseState] = useState<ParseState>({ status: "idle" });
  const [importing, startImport] = useTransition();

  // Editable metadata state populated after smart DOCX detection
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [grade, setGrade] = useState<number>(5);
  const [quarter, setQuarter] = useState<string>("");
  const [language, setLanguage] = useState<"ru" | "kz">("ru");
  const [section, setSection] = useState<string>("");

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".docx")) {
        setParseState({ status: "error", message: c.onlyDocx });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setParseState({ status: "error", message: c.tooLarge });
        return;
      }

      setParseState({ status: "parsing" });
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/import/docx", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          setParseState({ status: "error", message: data.error ?? c.parseError });
          return;
        }
        const content = data.content as KspContent;
        const subjects = Array.isArray(data.subjects) ? (data.subjects as SubjectRow[]) : [];
        const detected: DetectedMeta = {
          grade: typeof data.detected?.grade === "number" ? data.detected.grade : 5,
          quarter: typeof data.detected?.quarter === "number" ? data.detected.quarter : null,
          language: data.detected?.language === "kz" ? "kz" : "ru",
          subjectName: data.detected?.subjectName ?? null,
          subjectId: data.detected?.subjectId ?? null,
          section: data.detected?.section ?? content.header?.longTermPlanSection ?? null,
        };

        setTitle(content.topic?.trim() || c.defaultTitle);
        setSubjectId(detected.subjectId ?? "");
        setGrade(detected.grade >= 1 && detected.grade <= 11 ? detected.grade : 5);
        setQuarter(detected.quarter ? String(detected.quarter) : "");
        setLanguage(detected.language);
        setSection(detected.section ?? "");

        setParseState({ status: "done", content, subjects, detected });
      } catch {
        setParseState({ status: "error", message: c.networkError });
      }
    },
    [c.defaultTitle, c.networkError, c.onlyDocx, c.parseError, c.tooLarge],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const onSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile],
  );

  const reset = useCallback(() => {
    setParseState({ status: "idle" });
  }, []);

  const importPlan = useCallback(() => {
    if (parseState.status !== "done") return;
    startImport(async () => {
      const cleanTitle = title.trim() || parseState.content.topic?.trim() || c.defaultTitle;
      const cleanSection = section.trim();
      const updatedContent: KspContent = {
        ...parseState.content,
        topic: cleanTitle,
        header: {
          ...parseState.content.header,
          longTermPlanSection: cleanSection || parseState.content.header.longTermPlanSection,
        },
      };

      const parsedQuarter = quarter ? Number(quarter) : null;
      const result = await savePlanAction({
        title: cleanTitle,
        subject_id: subjectId || null,
        grade: grade >= 1 && grade <= 11 ? grade : 5,
        quarter: parsedQuarter && parsedQuarter >= 1 && parsedQuarter <= 4 ? parsedQuarter : null,
        section: cleanSection || null,
        visibility: "private",
        language,
        content: updatedContent,
      });
      if ("error" in result) {
        setParseState({ status: "error", message: result.error });
        return;
      }
      router.push(`/plans/${result.id}`);
    });
  }, [c.defaultTitle, grade, language, parseState, quarter, router, section, subjectId, title]);

  return (
    <div className="mx-auto max-w-[900px] space-y-8 px-4 py-12 md:px-6 md:py-16">
      <header className="border-b border-border pb-7">
        <p className="editorial-kicker">{c.kicker}</p>
        <h1 className="editorial-display mt-3 text-5xl">{c.title}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{c.lead}</p>
      </header>

      {parseState.status === "idle" || parseState.status === "parsing" ? (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-20 text-center transition-colors ${
            dragOver
              ? "border-primary bg-primary-soft"
              : "border-border-strong bg-surface hover:border-primary hover:bg-primary-soft/50"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".docx"
            className="hidden"
            onChange={onSelect}
          />
          {parseState.status === "parsing" ? (
            <Loader2 className="mb-4 size-10 animate-spin text-primary" />
          ) : (
            <Upload className="mb-4 size-10 text-muted-foreground" />
          )}
          <p className="text-lg font-semibold">
            {parseState.status === "parsing" ? c.parsing : c.dropTitle}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{c.dropSub}</p>
          <p className="mt-4 text-xs text-muted-foreground">{c.dropLimit}</p>
        </div>
      ) : null}

      {parseState.status === "error" ? (
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>{parseState.message}</AlertDescription>
          </Alert>
          <Button variant="outline" size="sm" onClick={reset}>
            {c.otherFile}
          </Button>
        </div>
      ) : null}

      {parseState.status === "done" ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-green-100">
                <Check className="size-5 text-green-600" />
              </div>
              <div>
                <p className="font-semibold">{c.doneTitle}</p>
                <p className="text-sm text-muted-foreground">{c.doneSub}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <X className="size-4" />
              {c.otherFile}
            </Button>
          </div>

          <Card className="border-primary/30 bg-primary-soft/20">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4 text-primary" />
                  {c.metaCardTitle}
                </CardTitle>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {c.autoBadge}
                </span>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="import-title">{c.planTitle}</Label>
                <Input
                  id="import-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="import-subject">{c.subjectLabel}</Label>
                <select
                  id="import-subject"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">{c.subjectNone}</option>
                  {parseState.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {locale === "kk" && s.name_kz ? s.name_kz : s.name_ru}
                    </option>
                  ))}
                </select>
                {parseState.detected.subjectName && !subjectId ? (
                  <p className="text-xs text-muted-foreground">
                    {c.detectedSubjectHint} <b>{parseState.detected.subjectName}</b>
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="import-grade">{c.gradeLabel}</Label>
                  <select
                    id="import-grade"
                    value={grade}
                    onChange={(e) => setGrade(Number(e.target.value))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {Array.from({ length: 11 }, (_, idx) => idx + 1).map((g) => (
                      <option key={g} value={g}>
                        {g} {c.gradeSuffix}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="import-quarter">{c.quarterLabel}</Label>
                  <select
                    id="import-quarter"
                    value={quarter}
                    onChange={(e) => setQuarter(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">{c.quarterNone}</option>
                    {[1, 2, 3, 4].map((q) => (
                      <option key={q} value={String(q)}>
                        {q} {c.quarterSuffix}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="import-lang">{c.langLabel}</Label>
                <select
                  id="import-lang"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value === "kz" ? "kz" : "ru")}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="ru">{c.langRu}</option>
                  <option value="kz">{c.langKz}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="import-section">{c.sectionLabel}</Label>
                <Input
                  id="import-section"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <ParsedPreview content={parseState.content} c={c} />

          <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
            <Button variant="outline" onClick={reset}>
              {c.cancel}
            </Button>
            <Button onClick={importPlan} disabled={importing}>
              {importing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  {c.importBtn}
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ParsedPreview({
  content,
  c,
}: {
  content: KspContent;
  c: (typeof COPY)["ru"] | (typeof COPY)["kk"];
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" />
            {c.infoCard}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <PreviewField label={c.topicField} value={content.topic} />
          <PreviewField label={c.schoolField} value={content.header.school} />
          <PreviewField label={c.teacherField} value={content.header.teacherName} />
          <PreviewField label={c.gradeField} value={content.header.grade} />
          <PreviewField label={c.dateField} value={content.header.date} />
          <PreviewField label={c.sectionField} value={content.header.longTermPlanSection} />
        </CardContent>
      </Card>

      {content.learningObjectives.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{c.learningObjTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {content.learningObjectives.map((o, i) => (
                <li key={i}>
                  {o.code && <span className="font-medium">{o.code} — </span>}
                  {o.text}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {content.lessonObjectives.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{c.lessonObjTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {content.lessonObjectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{c.flowTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["beginning", "middle", "end"] as const).map((key) => {
            const stage = content.stages[key];
            const labels = {
              beginning: c.stageBeg,
              middle: c.stageMid,
              end: c.stageEnd,
            };
            return (
              <div key={key} className="rounded-lg border border-border p-4">
                <p className="mb-2 text-sm font-semibold">
                  {labels[key]}
                  {stage.time && (
                    <span className="ml-2 font-normal text-muted-foreground">({stage.time})</span>
                  )}
                </p>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <PreviewField label={c.teacherAct} value={stage.teacherActions} />
                  <PreviewField label={c.studentAct} value={stage.studentActions} />
                  <PreviewField label={c.resources} value={stage.resources} />
                  <PreviewField label={c.assessment} value={stage.assessmentMethod} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewField({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  );
}
