"use client";

import { useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { KspContent } from "@/lib/types/ksp";

interface TranslateButtonProps {
  content: KspContent;
  currentLanguage: "ru" | "kz";
  disabled?: boolean;
  onTranslated: (translated: KspContent, target: "ru" | "kz") => void;
}

export function TranslateButton({
  content,
  currentLanguage,
  disabled,
  onTranslated,
}: TranslateButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target: "ru" | "kz" = currentLanguage === "ru" ? "kz" : "ru";
  const targetLabel = target === "kz" ? "казахский" : "русский";
  const buttonLabel = target === "kz" ? "→ KZ" : "→ RU";

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, targetLanguage: target }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      onTranslated(data.content as KspContent, target);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось перевести");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        title={`Перевести план на ${targetLabel} язык`}
      >
        <Languages />
        {buttonLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Перевести план на {targetLabel}?</DialogTitle>
            <DialogDescription>
              AI переведёт всё текстовое содержимое плана на {targetLabel}{" "}
              язык. Коды целей обучения, баллы и идентификаторы заданий
              сохранятся. Текущий план будет полностью заменён переводом —
              если вам нужна копия на исходном языке, сохраните план до
              запуска перевода.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Отмена
            </Button>
            <Button type="button" onClick={() => void run()} disabled={loading}>
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Languages />
              )}
              Перевести
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
