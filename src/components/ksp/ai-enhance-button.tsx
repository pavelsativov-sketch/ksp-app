"use client";

import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Section =
  | "lessonObjectives"
  | "assessmentCriteria"
  | "languageObjectivesTerms"
  | "languageObjectivesPhrases"
  | "values"
  | "priorKnowledge"
  | "healthAndSafety"
  | "reflection"
  | "differentiation";

export function AiEnhanceButton<T extends string | string[]>({
  section,
  current,
  onApply,
  context,
  label = "Улучшить AI",
}: {
  section: Section;
  current: T;
  onApply: (improved: T, note?: string) => void;
  context: { topic: string; subject: string; grade: number; language: "ru" | "kz" };
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setErr(null);
    setNote(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, current, context }),
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
        size="sm"
        onClick={run}
        disabled={loading}
        title="Переписать раздел через AI"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
        {label}
      </Button>
      {err && <span className="text-xs text-red-600">{err}</span>}
      {note && !err && <span className="text-xs text-amber-700">{note}</span>}
    </div>
  );
}
