"use client";

import { useEffect, useRef, useState } from "react";
import type { AiKspPayload } from "@/lib/ai/prompt";
import type { SchoolProfile } from "@/lib/types/ksp";
import type { RagRunInfo } from "@/lib/rag/metadata";

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

export interface AiGenerationInput {
  grade: number;
  subjectName: string;
  topic: string;
  learningObjectives: string[];
  language: "ru" | "kz";
  schoolProfile?: SchoolProfile;
  section?: string;
  previousTopic?: string;
  previousHomework?: string;
  textbookId: string | null;
  armanpvId?: string | null;
  planRevision?: string | null;
}

export interface AiRunReplayInput extends Omit<AiGenerationInput, "previousHomework"> {
  previousHomeworkIncluded: boolean;
}

export interface AiRunContext {
  id: string;
  grade: number;
  subject: string;
  topic: string;
  learningObjectives: string[];
  language: "ru" | "kz";
  schoolProfile?: SchoolProfile;
  section: string | null;
  previousLessonContextIncluded: boolean;
  textbookSelected: boolean;
  rag: RagRunInfo;
  generatedAt: string;
  planRevision: string | null;
  promptVersion: "ksp-generation-v1";
  replayInput: AiRunReplayInput;
}

const MAX_RUN_HISTORY = 10;

function isAiRunContext(value: unknown): value is AiRunContext {
  if (!value || typeof value !== "object") return false;
  const run = value as Partial<AiRunContext>;
  const replayInput = run.replayInput as (Partial<AiRunReplayInput> & Record<string, unknown>) | undefined;
  const rag = run.rag as (Partial<RagRunInfo> & { sources?: unknown[]; warnings?: unknown[] }) | undefined;
  const validSource = (source: unknown) => Boolean(source && typeof source === "object" &&
    typeof (source as RagRunInfo["sources"][number]).id === "string" &&
    Number.isInteger((source as RagRunInfo["sources"][number]).chunkIndex) &&
    ((source as RagRunInfo["sources"][number]).pageNumber === null || Number.isInteger((source as RagRunInfo["sources"][number]).pageNumber)));
  return typeof run.id === "string" && typeof run.topic === "string" &&
    typeof run.generatedAt === "string" && Number.isFinite(Date.parse(run.generatedAt)) && Number.isInteger(run.grade) &&
    typeof run.subject === "string" && Array.isArray(run.learningObjectives) && run.learningObjectives.every((item) => typeof item === "string") &&
    run.promptVersion === "ksp-generation-v1" &&
    typeof replayInput === "object" && replayInput !== null &&
    !Object.prototype.hasOwnProperty.call(replayInput, "previousHomework") &&
    typeof replayInput.topic === "string" && typeof replayInput.subjectName === "string" &&
    Number.isInteger(replayInput.grade) && Array.isArray(replayInput.learningObjectives) && replayInput.learningObjectives.every((item) => typeof item === "string") &&
    (replayInput.language === "ru" || replayInput.language === "kz") &&
    typeof replayInput.previousHomeworkIncluded === "boolean" &&
    typeof rag === "object" && rag !== null && Array.isArray(rag.sources) &&
    rag.sources.every(validSource) && Array.isArray(rag.warnings) && rag.warnings.every((warning) => typeof warning === "string") &&
    (rag.textbookTitle === null || typeof rag.textbookTitle === "string") &&
    ["not_selected", "unavailable", "ok", "degraded"].includes(String(rag.status));
}

export function usePlanAi({ historyKey = "default" }: { historyKey?: string } = {}) {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [ragNote, setRagNote] = useState<string | null>(null);
  const [quotaRemaining, setQuotaRemaining] = useState<number | null | undefined>(undefined);
  const [progress, setProgress] = useState<AiProgress | null>(null);
  const storageKey = `ksp-ai-run-history:${historyKey}`;
  const [runHistory, setRunHistory] = useState<AiRunContext[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) return parsed.filter(isAiRunContext).slice(-MAX_RUN_HISTORY);
    } catch {
      // Session storage is an optional local convenience
    }
    return [];
  });
  const [lastRunContext, setLastRunContext] = useState<AiRunContext | null>(() => runHistory.at(-1) ?? null);
  const abortRef = useRef<AbortController | null>(null);
  const requestsRef = useRef(new Map<string, AiGenerationInput>());
  const [prevStorageKey, setPrevStorageKey] = useState(storageKey);
  if (prevStorageKey !== storageKey) {
    setPrevStorageKey(storageKey);
    let loaded: AiRunContext[] = [];
    if (typeof window !== "undefined") {
      try {
        const raw = window.sessionStorage.getItem(storageKey);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) loaded = parsed.filter(isAiRunContext).slice(-MAX_RUN_HISTORY);
      } catch {
        // Session storage is an optional local convenience
      }
    }
    setRunHistory(loaded);
    setLastRunContext(loaded.at(-1) ?? null);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(runHistory.slice(-MAX_RUN_HISTORY)));
    } catch {
      // The in-memory history remains available when storage is disabled or full.
    }
  }, [runHistory, storageKey]);

  function cancelAi() {
    abortRef.current?.abort();
    abortRef.current = null;
    setAiLoading(false);
    setProgress(null);
    setLastRunContext(null);
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
  ): Promise<{ content: AiKspPayload; rag?: RagRunInfo | null; quota?: { remaining: number | null } }> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: { content: AiKspPayload; rag?: RagRunInfo | null; quota?: { remaining: number | null } } | null =
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
              rag?: RagRunInfo | null;
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

  async function generateWithAi(opts: AiGenerationInput): Promise<AiKspPayload | null> {
    setAiError(null);
    setRagNote(null);
    setProgress(null);
    setLastRunContext(null);
    if (!opts.topic.trim()) {
      setAiError("Укажите тему урока для генерации");
      return null;
    }
    setAiLoading(true);
    setProgress({ percent: 3, label: "Отправляем запрос" });
    const controller = new AbortController();
    abortRef.current = controller;
    const section = opts.section?.trim() || undefined;
    const previousTopic = opts.previousTopic?.trim() || undefined;
    const previousHomework = opts.previousHomework?.trim() || undefined;
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
          section,
          previousTopic,
          previousHomework,
          textbookId: opts.textbookId ?? undefined,
          armanpvId: opts.armanpvId ?? undefined,
        }),
        signal: controller.signal,
      });

      if (!res.body) throw new Error("Сервер не вернул поток генерации");

      const data = await readStream(res.body, setProgress);
      const textbookSelected = Boolean(opts.textbookId || opts.armanpvId);
      const rag: RagRunInfo = data.rag ?? {
        selected: textbookSelected,
        textbookTitle: null,
        chunkCount: 0,
        method: null,
        status: textbookSelected ? "unavailable" : "not_selected",
        warnings: textbookSelected ? ["Выбранный учебник недоступен; результат создан без него."] : [],
        sources: [],
      };
      const runId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const runContext: AiRunContext = {
        id: runId,
        grade: opts.grade,
        subject: opts.subjectName,
        topic: opts.topic,
        learningObjectives: [...opts.learningObjectives],
        language: opts.language,
        schoolProfile: opts.schoolProfile,
        section: opts.section?.trim() || null,
        previousLessonContextIncluded: Boolean(opts.previousTopic?.trim() || opts.previousHomework?.trim()),
        textbookSelected,
        rag,
        generatedAt: new Date().toISOString(),
        planRevision: opts.planRevision ?? null,
        promptVersion: "ksp-generation-v1",
        replayInput: {
          grade: opts.grade,
          subjectName: opts.subjectName,
          topic: opts.topic,
          learningObjectives: [...opts.learningObjectives],
          language: opts.language,
          schoolProfile: opts.schoolProfile,
          section: opts.section,
          previousTopic: opts.previousTopic,
          previousHomeworkIncluded: Boolean(opts.previousHomework?.trim()),
          textbookId: opts.textbookId,
          armanpvId: opts.armanpvId,
          planRevision: opts.planRevision ?? null,
        },
      };
      requestsRef.current.set(runId, { ...opts, learningObjectives: [...opts.learningObjectives] });
      while (requestsRef.current.size > MAX_RUN_HISTORY) {
        const oldestId = requestsRef.current.keys().next().value;
        if (!oldestId) break;
        requestsRef.current.delete(oldestId);
      }
      setLastRunContext(runContext);
      setRunHistory((history) => {
        const next = [...history.filter((item) => item.id !== runId), runContext].slice(-MAX_RUN_HISTORY);
        if (typeof window !== "undefined") {
          try {
            window.sessionStorage.setItem(storageKey, JSON.stringify(next));
          } catch {}
        }
        return next;
      });

      if (rag.chunkCount > 0) {
        setRagNote(`Использован учебник «${rag.textbookTitle ?? "—"}» (${rag.chunkCount} фрагментов)`);
      } else if (rag.warnings.length > 0) {
        setRagNote(rag.warnings.join(" "));
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

  async function replayRun(runId: string): Promise<AiKspPayload | null> {
    const savedRequest = requestsRef.current.get(runId);
    if (savedRequest) return generateWithAi(savedRequest);
    const run = runHistory.find((item) => item.id === runId);
    if (!run) return null;
    const safeInput: AiGenerationInput = {
      grade: run.replayInput.grade,
      subjectName: run.replayInput.subjectName,
      topic: run.replayInput.topic,
      learningObjectives: [...run.replayInput.learningObjectives],
      language: run.replayInput.language,
      schoolProfile: run.replayInput.schoolProfile,
      section: run.replayInput.section,
      previousTopic: run.replayInput.previousTopic,
      textbookId: run.replayInput.textbookId,
      armanpvId: run.replayInput.armanpvId,
      planRevision: run.planRevision,
    };
    return generateWithAi({ ...safeInput, previousHomework: undefined });
  }

  const canReplayExactly = (runId: string) => requestsRef.current.has(runId);

  return {
    generateWithAi,
    aiLoading,
    aiError,
    ragNote,
    lastRunContext,
    runHistory,
    replayRun,
    canReplayExactly,
    quotaRemaining,
    progress,
    setAiError,
    setRagNote,
    cancelAi,
  };
}
