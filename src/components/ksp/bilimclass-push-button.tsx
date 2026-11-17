"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setActiveAgentTask } from "@/components/agents/agent-dock";

export interface BilimclassPushProps {
  planId: string;
  topic: string;
  subjectName: string;
  grade: number;
  classLabel?: string;
  date?: string;
  learningObjectives: string[];
  homework?: string;
  schoolId?: string | null;
  language?: "ru" | "kz";
}

export function BilimclassPushButton({
  topic,
  subjectName,
  grade,
  classLabel,
  date,
  learningObjectives,
  homework,
  schoolId,
  language = "ru",
}: BilimclassPushProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePush() {
    setLoading(true);
    setError(null);

    const targetClass = classLabel?.trim() || `${grade} класс`;
    const objectivesLine =
      learningObjectives.length > 0
        ? learningObjectives.slice(0, 4).join("; ")
        : "по теме урока";
    const hwLine = homework?.trim() || "Повторить конспект и выполнить задание по теме урока.";

    const prompt = [
      `Открой BilimClass (https://www.bilimclass.kz/2026/frontoffice/dashboard) и помоги заполнить поурочный план и домашнее задание по готовому КСП.`,
      `Предмет: ${subjectName}. Класс: ${targetClass}.${date ? ` Дата урока: ${date}.` : ""}`,
      `Тема урока: «${topic}».`,
      `Цели обучения (ГОСО): ${objectivesLine}.`,
      `Домашнее задание: ${hwLine}`,
      `ВАЖНО: если требуется вход в BilimClass — попроси меня войти или используй подключённый коннектор. Заполни поля темы урока и домашнего задания, но ОБЯЗАТЕЛЬНО остановись перед нажатием кнопки «Сохранить» и запроси моё подтверждение.`,
    ].join("\n");

    try {
      const res = await fetch("/api/agents/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          schoolId: schoolId ?? null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        taskId?: string;
        error?: string;
      };
      if (!res.ok || !data.taskId) {
        throw new Error(data.error || "Не удалось запустить помощника BilimClass");
      }
      setActiveAgentTask(
        data.taskId,
        `BilimClass: ${topic.slice(0, 48)}`,
        prompt,
      );
      router.push("/school?os=browser");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка запуска");
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        onClick={() => void handlePush()}
        disabled={loading}
        title={
          language === "kz"
            ? "ҚМЖ тақырыбы мен үй тапсырмасын BilimClass-қа толтыру (сақтау алдында растау сұралады)"
            : "Перенести тему, цели и ДЗ в BilimClass через облачный браузер (с подтверждением перед сохранением)"
        }
      >
        {loading ? <Loader2 className="animate-spin" /> : <Globe />}
        {language === "kz" ? "BilimClass-қа толтыру" : "Заполнить в BilimClass"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
