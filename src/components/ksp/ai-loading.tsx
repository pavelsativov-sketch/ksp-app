"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

interface AiLoadingOverlayProps {
  steps: string[];
  currentStep: number;
  onCancel: () => void;
}

export function AiLoadingOverlay({ steps, currentStep, onCancel }: AiLoadingOverlayProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const progress = Math.min(((currentStep + 1) / steps.length) * 100, 100);

  // Estimate remaining time: typical generation is 20-60 seconds
  const estimatedRemaining = Math.max(0, Math.min(60, 40 - elapsed));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-popover">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 animate-pulse text-primary" />
            <span className="font-semibold">AI заполняет план</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Отменить генерацию"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Steps */}
        <div className="mb-4 space-y-2">
          {steps.map((step, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 text-sm ${
                i < currentStep
                  ? "text-muted-foreground"
                  : i === currentStep
                    ? "font-medium text-foreground"
                    : "text-muted-foreground/50"
              }`}
            >
              <span
                className={`flex size-5 items-center justify-center rounded-full text-[10px] ${
                  i < currentStep
                    ? "bg-primary text-white"
                    : i === currentStep
                      ? "border-2 border-primary text-primary"
                      : "border border-border-strong text-muted-foreground"
                }`}
              >
                {i < currentStep ? "✓" : i + 1}
              </span>
              {step}
            </div>
          ))}
        </div>

        {/* Time estimate */}
        <div className="mb-4 text-center text-xs text-muted-foreground">
          {estimatedRemaining > 0 ? (
            <>Примерно осталось: {estimatedRemaining} сек</>
          ) : (
            <>Процесс может занять до 60 секунд</>
          )}
        </div>

        {/* Cancel button */}
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-lg border border-border py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Отменить генерацию
        </button>
      </div>
    </div>
  );
}
