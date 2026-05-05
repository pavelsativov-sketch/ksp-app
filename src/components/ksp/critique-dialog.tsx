"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { KspContent } from "@/lib/types/ksp";
import type {
  CritiqueIssue,
  CritiqueResult,
  CritiqueSeverity,
} from "@/lib/ai/critique";

interface CritiqueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: KspContent;
  language: "ru" | "kz";
}

const SEVERITY_META: Record<
  CritiqueSeverity,
  {
    label: { ru: string; kz: string };
    icon: typeof Info;
    badge: string;
    text: string;
    border: string;
  }
> = {
  error: {
    label: { ru: "Критично", kz: "Маңызды" },
    icon: AlertCircle,
    badge: "bg-red-100 text-red-800",
    text: "text-red-700",
    border: "border-red-200 bg-red-50",
  },
  warn: {
    label: { ru: "Замечание", kz: "Ескерту" },
    icon: AlertTriangle,
    badge: "bg-amber-100 text-amber-800",
    text: "text-amber-700",
    border: "border-amber-200 bg-amber-50",
  },
  info: {
    label: { ru: "Подсказка", kz: "Кеңес" },
    icon: Info,
    badge: "bg-sky-100 text-sky-800",
    text: "text-sky-700",
    border: "border-sky-200 bg-sky-50",
  },
};

export function CritiqueDialog({
  open,
  onOpenChange,
  content,
  language,
}: CritiqueDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CritiqueResult | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/critique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, language }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setResult(data as CritiqueResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось проверить план");
    } finally {
      setLoading(false);
    }
  }

  // Auto-run when the dialog opens; reset state on close.
  // Both branches defer their setState calls to a microtask so they run
  // outside the effect body (avoids cascading renders / set-state-in-effect).
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!open) {
        setResult(null);
        setError(null);
      } else {
        void run();
      }
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const labelTitle =
    language === "kz" ? "ҚМЖ-ны AI-мен тексеру" : "AI-проверка плана";
  const labelDescription =
    language === "kz"
      ? "AI әдіскер сабақ жоспарын жаңартылған білім мазмұны стандартына сай тексереді."
      : "AI-методист проверяет план на соответствие стандарту обновлённого содержания РК.";
  const labelEmpty =
    language === "kz"
      ? "Ескерту жоқ — жоспар стандартқа сай."
      : "Замечаний нет — план соответствует стандарту.";
  const labelRetry = language === "kz" ? "Қайта тексеру" : "Перепроверить";
  const labelRunning =
    language === "kz" ? "Тексеру жүріп жатыр..." : "Проверяем план...";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labelTitle}</DialogTitle>
          <DialogDescription>{labelDescription}</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-3 rounded border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span>{labelRunning}</span>
          </div>
        )}

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
              <strong className="font-semibold">
                {language === "kz" ? "Жалпы баға:" : "Общая оценка:"}
              </strong>{" "}
              {result.summary}
            </div>

            {result.issues.length === 0 ? (
              <div className="flex items-center gap-3 rounded border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span>{labelEmpty}</span>
              </div>
            ) : (
              <ul className="space-y-2">
                {result.issues.map((issue, idx) => (
                  <CritiqueIssueRow key={idx} issue={issue} language={language} />
                ))}
              </ul>
            )}

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void run()}
                disabled={loading}
              >
                <RefreshCcw />
                {labelRetry}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CritiqueIssueRow({
  issue,
  language,
}: {
  issue: CritiqueIssue;
  language: "ru" | "kz";
}) {
  const meta = SEVERITY_META[issue.severity];
  const Icon = meta.icon;
  return (
    <li className={`rounded border px-3 py-3 text-sm ${meta.border}`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.text}`} />
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${meta.badge}`}
            >
              {meta.label[language]}
            </span>
            <code className="text-xs text-slate-500 font-mono">
              {issue.section}
            </code>
          </div>
          <p className="text-slate-800">{issue.message}</p>
          {issue.suggestion && (
            <p className="text-slate-600 italic">
              <span className="font-medium not-italic">
                {language === "kz" ? "Ұсыныс: " : "Предложение: "}
              </span>
              {issue.suggestion}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
