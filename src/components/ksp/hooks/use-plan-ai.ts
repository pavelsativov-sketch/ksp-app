import { useRef, useState } from "react";
import type { AiKspPayload } from "@/lib/ai/prompt";
import type { SchoolProfile } from "@/lib/types/ksp";

export function usePlanAi() {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [ragNote, setRagNote] = useState<string | null>(null);
  const [quotaRemaining, setQuotaRemaining] = useState<number | null | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  function cancelAi() {
    abortRef.current?.abort();
    abortRef.current = null;
    setAiLoading(false);
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
    if (!opts.topic.trim()) {
      setAiError("Укажите тему урока для AI-генерации");
      return null;
    }
    setAiLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/ai/generate", {
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
      if (!res.ok) {
        let errorMsg = "Ошибка AI";
        try {
          const errData = await res.json() as { error?: string; code?: string; kspRemaining?: number };
          if (errData.code === "KSP_QUOTA_EXCEEDED") {
            errorMsg = `Лимит КСП исчерпан. ${errData.error ?? ""}`;
          } else {
            errorMsg = errData.error ?? errorMsg;
          }
        } catch {
          errorMsg = (await res.text()) || errorMsg;
        }
        throw new Error(errorMsg);
      }
      const data = await res.json() as {
        content: AiKspPayload;
        rag?: { textbookTitle: string | null; chunkCount: number; warnings?: string[] } | null;
        quota?: { remaining: number | null };
      };
      if (data.rag) {
        const source = data.rag.chunkCount > 0
          ? `Использован учебник «${data.rag.textbookTitle ?? "—"}» (${data.rag.chunkCount} фрагментов)`
          : "";
        setRagNote([source, ...(data.rag.warnings ?? [])].filter(Boolean).join(" ") || null);
      }
      if (data.quota !== undefined) {
        setQuotaRemaining(data.quota.remaining);
      }
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

  return { generateWithAi, aiLoading, aiError, ragNote, quotaRemaining, setAiError, setRagNote, cancelAi };
}
