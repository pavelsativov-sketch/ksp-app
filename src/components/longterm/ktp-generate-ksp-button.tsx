"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface KtpGenerateKspButtonProps {
  subject: string;
  grade: number;
  topic: string;
  objectives?: string;
  previousTopic?: string;
  mediumTermId?: string;
  topicIndex?: number;
  locale?: "ru" | "kk";
}

/**
 * Кнопка «Создать КСП + комплект в 1 клик» прямо из строки КТП / ССП / ДСП:
 * передаёт тему, предмет, класс, цели ГОСО и предыдущую тему в /api/lessons,
 * привязывает созданный КСП к строке ССП (если указан mediumTermId) и открывает готовый урок с автозапуском комплекта.
 */
export function KtpGenerateKspButton({
  subject,
  grade,
  topic,
  objectives,
  previousTopic,
  mediumTermId,
  topicIndex,
  locale = "ru",
}: KtpGenerateKspButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isKk = locale === "kk";

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const enrichedTopic = [
        topic,
        objectives ? `(Цели ГОСО: ${objectives.slice(0, 300)})` : "",
        previousTopic ? `(Предыдущий урок: ${previousTopic.slice(0, 140)})` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 1800);

      const res = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade,
          subject,
          topic: enrichedTopic,
          language: isKk ? "kz" : "ru",
          kit: {
            workForms: ["individual", "pair"],
            minutes: 45,
            oop: { present: false },
          },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { planId?: string; error?: string };
      if (!res.ok || !data.planId) {
        throw new Error(data.error || "Не удалось сгенерировать КСП");
      }

      if (mediumTermId) {
        await fetch("/api/mediumterm", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mediumTermId,
            kspId: data.planId,
            topicIndex,
            action: "link",
          }),
        }).catch(() => {});
      }

      router.push(`/plans/${data.planId}?kit=start`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка создания КСП");
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        onClick={() => void handleCreate()}
        disabled={loading}
        className="gap-1.5 text-xs"
      >
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {loading
          ? isKk
            ? "ҚМЖ құрылуда…"
            : "Создаём КСП…"
          : isKk
            ? "ҚМЖ + жинақ жасау"
            : "Создать КСП + комплект"}
      </Button>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </span>
  );
}
