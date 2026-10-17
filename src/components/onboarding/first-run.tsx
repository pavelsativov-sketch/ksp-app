"use client";

import * as React from "react";
import { useState, useSyncExternalStore, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sparkles, ArrowRight, ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "mekty:onboarding-completed";

const STEPS = [
  {
    id: "welcome",
    title: "Добро пожаловать в Mekty!",
    description:
      "Mekty помогает учителям Казахстана создавать КСП, рабочие листы и презентации за считанные минуты. Давайте покажем, как это работает.",
  },
  {
    id: "how-it-works",
    title: "Как это работает",
    description:
      "Всё начинается с темы урока. AI заполнит план, задания и слайды — вы проверяете, редактируете и скачиваете готовый комплект. Без пустой страницы и часов подготовки.",
  },
  {
    id: "try-now",
    title: "Попробуйте прямо сейчас",
    description:
      "Создайте свой первый КСП бесплатно. 3 плана в месяц — без банковской карты. Начните с темы ближайшего урока — остальное сделает AI.",
  },
];

/**
 * Флаг «онбординг пройден» читается из localStorage как из внешнего хранилища:
 * useSyncExternalStore даёт hydration-safe чтение без setState в эффекте
 * (сервер и первый клиентский рендер считают онбординг пройденным, модалка
 * открывается сразу после гидрации).
 */
const completedStore = {
  subscribe(onChange: () => void) {
    // Единственное уведомление от localStorage — cross-tab событие storage.
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  },
  getSnapshot(): boolean {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      // localStorage unavailable — skip onboarding
      return true;
    }
  },
  getServerSnapshot(): boolean {
    return true;
  },
};

export function FirstRunOnboarding() {
  const router = useRouter();
  const pathname = usePathname();
  const completed = useSyncExternalStore(
    completedStore.subscribe,
    completedStore.getSnapshot,
    completedStore.getServerSnapshot,
  );
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(0);
  
  // Automatically dismiss onboarding when navigating to important pages
  useEffect(() => {
    if (pathname.startsWith('/school') || pathname.startsWith('/workspace')) {
      setDismissed(true);
    }
  }, [pathname]);
  
  const open = !completed && !dismissed;

  function markCompleted() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Storage unavailable — onboarding will show again next time
    }
    // localStorage не уведомляет React о записи — закрываем через состояние.
    setDismissed(true);
  }

  function handleSkip() {
    markCompleted();
  }

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      markCompleted();
      router.push("/plans/new");
    }
  }

  function handleBack() {
    if (step > 0) {
      setStep(step - 1);
    }
  }

  const isLastStep = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleSkip(); }}>
      <DialogContent
        className="max-w-md rounded-2xl bg-surface p-6 shadow-2xl"
        overlayClassName="overflow-y-auto p-4"
        aria-label="Первый вход в Mekty"
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {STEPS[step].title}
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {STEPS[step].description}
          </DialogDescription>
        </DialogHeader>

        {/* Progress dots */}
        <div className="mt-6 flex items-center justify-center gap-2">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStep(i)}
              aria-label={`Шаг ${i + 1}`}
              className={cn(
                "h-2.5 rounded-full transition-all duration-300",
                i === step
                  ? "w-8 bg-primary"
                  : i < step
                    ? "w-2.5 bg-primary/50"
                    : "w-2.5 bg-border",
              )}
            />
          ))}
        </div>

        {/* Step content illustration */}
        <div className="mt-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft">
            {step === 0 && <Sparkles className="size-8 text-primary" />}
            {step === 1 && <ArrowRight className="size-8 text-primary" />}
            {step === 2 && <Check className="size-8 text-primary" />}
          </div>
        </div>

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={handleSkip}
            className="text-muted-foreground"
          >
            Пропустить
          </Button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
              >
                <ArrowLeft />
                Назад
              </Button>
            )}
            <Button type="button" onClick={handleNext}>
              {isLastStep ? (
                <>
                  Начать
                  <Sparkles />
                </>
              ) : (
                <>
                  Далее
                  <ArrowRight />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
