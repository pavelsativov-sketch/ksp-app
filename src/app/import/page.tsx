"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, AlertTriangle, Check, Loader2, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { KspContent } from "@/lib/types/ksp";
import { savePlanAction } from "@/app/actions/plans";

type ParseState =
  | { status: "idle" }
  | { status: "parsing" }
  | { status: "done"; content: KspContent }
  | { status: "error"; message: string };

export default function ImportPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parseState, setParseState] = useState<ParseState>({ status: "idle" });
  const [importing, startImport] = useTransition();

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setParseState({ status: "error", message: "Поддерживаются только файлы .docx" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setParseState({ status: "error", message: "Файл больше 10 МБ" });
      return;
    }

    setParseState({ status: "parsing" });
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import/docx", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setParseState({ status: "error", message: data.error ?? "Ошибка при обработке файла" });
        return;
      }
      setParseState({ status: "done", content: data.content });
    } catch {
      setParseState({ status: "error", message: "Не удалось обработать файл. Попробуйте ещё раз." });
    }
  }, []);

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
      const content = parseState.content;
      const title = content.topic || "Импортированный КСП";
      const result = await savePlanAction({
        title,
        subject_id: null,
        grade: 5,
        quarter: null,
        section: null,
        visibility: "private",
        language: "ru",
        content,
      });
      if ("error" in result) {
        setParseState({ status: "error", message: result.error });
        return;
      }
      router.push(`/plans/${result.id}`);
    });
  }, [parseState, router]);

  return (
    <div className="mx-auto max-w-[900px] space-y-8 px-4 py-12 md:px-6 md:py-16">
      <header className="border-b border-border pb-7">
        <p className="editorial-kicker">Импорт</p>
        <h1 className="editorial-display mt-3 text-5xl">Импорт КСП из Word</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Загрузите .docx файл с планом урока — мы извлечём структуру и позволим проверить перед сохранением.
        </p>
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
            {parseState.status === "parsing" ? "Обрабатываем файл…" : "Перетащите .docx файл сюда"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            или нажмите, чтобы выбрать файл
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Поддерживаются файлы до 10 МБ
          </p>
        </div>
      ) : null}

      {parseState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription>{parseState.message}</AlertDescription>
        </Alert>
      ) : null}

      {parseState.status === "done" ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-green-100">
                <Check className="size-5 text-green-600" />
              </div>
              <div>
                <p className="font-semibold">Документ успешно обработан</p>
                <p className="text-sm text-muted-foreground">Проверьте данные перед импортом</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <X className="size-4" />
              Другой файл
            </Button>
          </div>

          <ParsedPreview content={parseState.content} />

          <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
            <Button variant="outline" onClick={reset}>
              Отмена
            </Button>
            <Button onClick={importPlan} disabled={importing}>
              {importing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  Импортировать как новый КСП
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

function ParsedPreview({ content }: { content: KspContent }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" />
            Основная информация
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <PreviewField label="Тема урока" value={content.topic} />
          <PreviewField label="Школа" value={content.header.school} />
          <PreviewField label="Учитель" value={content.header.teacherName} />
          <PreviewField label="Класс" value={content.header.grade} />
          <PreviewField label="Дата" value={content.header.date} />
          <PreviewField label="Раздел ДП" value={content.header.longTermPlanSection} />
        </CardContent>
      </Card>

      {content.learningObjectives.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Цели обучения</CardTitle>
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
            <CardTitle className="text-base">Цели урока</CardTitle>
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
          <CardTitle className="text-base">Ход урока</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["beginning", "middle", "end"] as const).map((key) => {
            const stage = content.stages[key];
            const labels = { beginning: "Начало урока", middle: "Середина урока", end: "Конец урока" };
            return (
              <div key={key} className="rounded-lg border border-border p-4">
                <p className="mb-2 font-semibold text-sm">
                  {labels[key]}
                  {stage.time && <span className="ml-2 font-normal text-muted-foreground">({stage.time})</span>}
                </p>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <PreviewField label="Действия педагога" value={stage.teacherActions} />
                  <PreviewField label="Действия ученика" value={stage.studentActions} />
                  <PreviewField label="Ресурсы" value={stage.resources} />
                  <PreviewField label="Оценивание" value={stage.assessmentMethod} />
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
