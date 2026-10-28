"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type RecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onstart: ((e: Event) => void) | null;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: ((e: Event) => void) | null;
};

function getRecognitionCtor(): (new () => RecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => RecognitionInstance;
    webkitSpeechRecognition?: new () => RecognitionInstance;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceInput({
  value,
  onChange,
  language,
  placeholder,
  ariaLabel,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  language: "ru" | "kz";
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const [supported] = useState<boolean | null>(() => Boolean(getRecognitionCtor()));
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const baseRef = useRef("");
  const recRef = useRef<RecognitionInstance | null>(null);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {}
  }, []);

  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort?.();
      } catch {}
    };
  }, []);

  function start() {
    setError(null);
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("Голосовой ввод не поддерживается в этом браузере");
      return;
    }
    const rec = new Ctor();
    rec.lang = language === "kz" ? "kk-KZ" : "ru-RU";
    rec.continuous = false;
    rec.interimResults = true;
    recRef.current = rec;
    baseRef.current = value;

    rec.onstart = () => {
      setListening(true);
      setInterim("");
    };
    // Web Speech types in lib.dom are incomplete; result is SpeechRecognitionResultList
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interimText = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i] as { isFinal: boolean; 0: { transcript: string } };
        const t = res[0]?.transcript ?? "";
        if (res.isFinal) finalText += t + " ";
        else interimText += t + " ";
      }
      if (interimText) setInterim(interimText.trim());
      if (finalText) {
        const next = [baseRef.current.trim(), finalText.trim()].filter(Boolean).join(" ");
        onChange(next);
        setInterim("");
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      const code = e?.error as string | undefined;
      if (code === "not-allowed" || code === "service-not-allowed") {
        setError("Разрешите доступ к микрофону в браузере");
      } else if (code === "no-speech") {
        setError("Речь не распознана — попробуйте ещё раз");
      } else if (code) {
        setError(`Ошибка распознавания: ${code}`);
      }
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    try {
      rec.start();
    } catch (err) {
      setListening(false);
      setError(err instanceof Error ? err.message : "Не удалось запустить распознавание");
    }
  }

  const isSupported = supported === true;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            value={listening && interim ? [value, interim].filter(Boolean).join(" ") : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-label={ariaLabel}
            disabled={disabled || listening}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 pr-9 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          {listening && (
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </span>
          )}
        </div>
        <Button
          type="button"
          variant={listening ? "destructive" : "outline"}
          size="icon"
          onClick={() => (listening ? stop() : start())}
          disabled={disabled || supported === false}
          aria-label={listening ? "Остановить запись" : "Голосовой ввод"}
          title={
            supported === false
              ? "Голосовой ввод не поддерживается"
              : listening
                ? "Остановить"
                : "Начать голосовой ввод"
          }
        >
          {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
        </Button>
      </div>
      {supported === false && (
        <p className="text-xs text-muted-foreground">
          Голосовой ввод недоступен в этом браузере. Используйте Chrome/Edge.
        </p>
      )}
      {isSupported && !listening && !error && (
        <p className="text-xs text-muted-foreground">Нажмите 🎤 и продиктуйте тему урока</p>
      )}
      {listening && <p className="text-xs text-amber-700">Слушаю… говорите чётко</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
