"use client";

import { useState } from "react";
import { Loader2, ThumbsDown, ThumbsUp, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type EnhanceSection =
  // top-level
  | "lessonObjectives"
  | "assessmentCriteria"
  | "languageObjectivesTerms"
  | "languageObjectivesPhrases"
  | "glossary"
  | "values"
  | "priorKnowledge"
  | "crossCurricularLinks"
  | "formativeAssessment"
  | "differentiation"
  | "healthAndSafety"
  | "reflection"
  // per-stage
  | "teacherActions"
  | "studentActions"
  | "resources"
  | "keyQuestions"
  | "descriptors"
  | "reflectionQuestions"
  | "homework"
  | "summary";

export type EnhanceStage = "beginning" | "middle" | "end";

export function AiEnhanceButton<T extends string | string[]>({
  section,
  stage,
  current,
  onApply,
  context,
  label = "Улучшить AI",
  size = "sm",
}: {
  section: EnhanceSection;
  stage?: EnhanceStage;
  current: T;
  onApply: (improved: T, note?: string) => void;
  context: { topic: string; subject: string; grade: number; language: "ru" | "kz" };
  label?: string;
  size?: "sm" | "default";
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [rated, setRated] = useState<"up" | "down" | null>(null);

  async function sendFeedback(rating: "up" | "down") {
    setRated(rating);
    try {
      await fetch("/api/ai/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "enhance", section, rating }),
      });
    } catch {
      // Фидбэк необязателен — молча игнорируем сбои.
    }
  }

  async function run() {
    setErr(null);
    setNote(null);
    setApplied(false);
    setRated(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, stage, current, context }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        improved: string | string[];
        isList: boolean;
        stub?: boolean;
        note?: string;
      };
      onApply(data.improved as T, data.note);
      if (data.stub && data.note) setNote(data.note);
      if (!data.stub) setApplied(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка AI");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size={size}
        onClick={run}
        disabled={loading}
        title="Переписать раздел через AI"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
        {label}
      </Button>
      {applied && rated === null && (
        <span className="flex items-center gap-0.5" title="Помог ли результат AI?">
          <Button type="button" variant="ghost" size="sm" onClick={() => void sendFeedback("up")} title="Хорошо">
            <ThumbsUp className="size-3.5 text-[#2f5b4f]" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void sendFeedback("down")} title="Плохо">
            <ThumbsDown className="size-3.5 text-[#8a817a]" />
          </Button>
        </span>
      )}
      {rated !== null && <span className="text-xs text-[#6b7480]">Спасибо за оценку!</span>}
      {err && <span className="text-xs text-red-600">{err}</span>}
      {note && !err && <span className="text-xs text-amber-700">{note}</span>}
    </div>
  );
}
