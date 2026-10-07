"use client";

import { useRef, useState } from "react";
import type { AiKspPayload } from "@/lib/ai/prompt";
import type { SchoolProfile } from "@/lib/types/ksp";

/**
 * Генерация КСП с живым прогрессом.
 *
 * Хук читает поток `/api/ai/generate/stream`: сервер присылает реальные
 * этапы («ищем в учебнике», «составляем ход урока», «проверяем методистом»),
 * а проценты считаются из них. Раньше оверлей рисовал проценты по таймеру —
 * они не двигались, пока модель думала, и учитель не понимал, идёт ли дело.
 */

export interface AiProgress {
  percent: number;
  label: string;
}

interface RagInfo {
  textbookTitle: string | null;
  chunkCount: number;
  warnings?: string[];
}

export function usePlanAi() {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [ragNote, setRagNote] = useState<string | null>(null);
  const [quotaRemaining, setQuotaRemaining] = useState<number | null | undefined>(undefined);
  const [progress, setProgress] = useState<AiProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function cancelAi() {
    abortRef.current?.abort();
    abortRef.current = null;
    setAiLoading(false);
    setProgress(null);
  }

  /**
   * Разбирает поток событий.
   *
   * Отдельная функция, а не код в try: её логику (выборка кадров, порядок
   * ошибок) нужно проверять без браузера и без сети.
   */
  async function readStream(
    body: ReadableStream<Uint8Array>,
    onProgress: (p: AiProgress) => void,
  ): Promise<{ content: AiKspPayload; rag?: RagInfo | null; quota?: { remaining: number | null } }> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: { content: AiKspPayload; rag?: RagInfo | null; quota?: { remaining: number | null } } | null =
      null;
    let failure: string | null = null;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE отдаёт кадры, разделённые пустой строкой. Неполный хвост ждёт
      // следующего чтения — иначе JSON режется пополам.
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 2);
        if (frame.startsWith("data:")) {
          try {
            const event = JSON.parse(frame.slice(5).trim()) as {
              type?: string;
              percent?: number;
              label?: string;
              content?: AiKspPayload;
              rag?: RagInfo | null;
              quota?: { remaining: number | null };
              error?: string;
            };
            if (event.type === "progress" && typeof event.percent === "number") {
              onProgress({ percent: event.percent, label: event.label ?? "" });
            } else if (event.type === "done" && event.content) {
              result = { content: event.content, rag: event.rag, quota: event.quota };
            } else if (event.type === "error") {
              failure = event.error ?? "Не удалось сгенерировать КСП";
            }
          } catch {
            // Повреждённый кадр не должен рвать генерацию: следующий придёт.
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
    }

    if (failure) throw new Error(failure);
    if (!result) throw new Error("Сервер закрыл поток, не вернув план");
    return result;
  }

  async function generateWithAi(opts: {
    grade: number;
    subjectName: string;
    topic: string;
    learningObjectives: string[];
    language: "ru" | "kz";
    schoolProfile?: SchoolProfile;
    textbookId: string | null;
  }): Promise<AiKspPayload | null> {
    setAiError(null);
    setRagNote(null);
    setProgress(null);
    if (!opts.topic.trim()) {
      setAiError("Укажите тему урока для генерации");
      return null;
    }
    setAiLoading(true);
    setProgress({ percent: 3, label: "Отправляем запрос" });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/ai/generate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade: opts.grade,
          subject: opts.subjectName,
          topic: opts.topic,
          learningObjectives: opts.learningObjectives,
          language: opts.language,
          schoolProfile: opts.schoolProfile,
          textbookId: opts.textbookId ?? undefined,
        }),
        signal: controller.signal,
      });

      if (!res.body) throw new Error("Сервер не вернул поток генерации");

      const data = await readStream(res.body, setProgress);

      if (data.rag) {
        const source =
          data.rag.chunkCount > 0
            ? `Использован учебник «${data.rag.textbookTitle ?? "—"}» (${data.rag.chunkCount} фрагментов)`
            : "";
        setRagNote([source, ...(data.rag.warnings ?? [])].filter(Boolean).join(" ") || null);
      }
      if (data.quota !== undefined) {
        setQuotaRemaining(data.quota.remaining);
      }
      setProgress({ percent: 100, label: "План готов" });
      return data.content;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setAiError("Генерация отменена");
      } else {
        setAiError(e instanceof Error ? e.message : "Не удалось сгенерировать");
      }
      return null;
    } finally {
      setAiLoading(false);
      abortRef.current = null;
    }
  }

  return {
    generateWithAi,
    aiLoading,
    aiError,
    ragNote,
    quotaRemaining,
    progress,
    setAiError,
    setRagNote,
    cancelAi,
  };
}
