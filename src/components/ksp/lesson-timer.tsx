"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Play, Pause, RotateCcw, Maximize, Minimize, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

const PRESET_DURATIONS = [5, 10, 15, 20, 30, 45];

interface LessonTimerProps {
  /** Initial duration in minutes */
  initialMinutes?: number;
  /** Label shown above the timer (e.g. stage name) */
  label?: string;
  /** Callback when timer completes */
  onComplete?: () => void;
  /** Compact mode for embedding in lists */
  compact?: boolean;
}

export function LessonTimer({
  initialMinutes = 10,
  label,
  onComplete,
  compact = false,
}: LessonTimerProps) {
  const [totalSeconds, setTotalSeconds] = useState(initialMinutes * 60);
  const [remainingSeconds, setRemainingSeconds] = useState(initialMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isCompleted, setIsCompleted] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const progress = totalSeconds > 0 ? ((totalSeconds - remainingSeconds) / totalSeconds) * 100 : 0;
  const isOvertime = remainingSeconds <= 0;

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const abs = Math.abs(seconds);
    const m = Math.floor(abs / 60);
    const s = abs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Play completion sound using Web Audio API
  const playSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = new AudioContext();
      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      const now = ctx.currentTime;
      playTone(523.25, now, 0.3); // C5
      playTone(659.25, now + 0.15, 0.3); // E5
      playTone(783.99, now + 0.3, 0.5); // G5
    } catch {
      // Audio not available
    }
  }, [soundEnabled]);

  // Timer logic
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setRemainingSeconds((prev) => {
          const next = prev - 1;
          if (next <= 0) {
            setIsRunning(false);
            setIsCompleted(true);
            playSound();
            onComplete?.();
          }
          return next;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, onComplete, playSound]);

  // Fullscreen handling
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen not supported
    }
  };

  const handleStartPause = () => {
    if (isCompleted) {
      // Restart if completed
      setRemainingSeconds(totalSeconds);
      setIsCompleted(false);
      setIsRunning(true);
      return;
    }
    setIsRunning(!isRunning);
  };

  const handleReset = () => {
    setIsRunning(false);
    setIsCompleted(false);
    setRemainingSeconds(totalSeconds);
  };

  const handlePreset = (minutes: number) => {
    setTotalSeconds(minutes * 60);
    setRemainingSeconds(minutes * 60);
    setIsRunning(false);
    setIsCompleted(false);
    setCustomMinutes("");
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mins = parseInt(customMinutes, 10);
    if (!isNaN(mins) && mins > 0 && mins <= 180) {
      handlePreset(mins);
    }
  };

  // SVG circle parameters
  const radius = compact ? 50 : 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col items-center gap-4 rounded-card border border-border bg-surface p-6 text-foreground",
        isFullscreen && "fixed inset-0 z-50 justify-center gap-8 rounded-none bg-surface",
      )}
    >
      {label && (
        <p className={cn("text-center font-bold text-muted-foreground", compact ? "text-sm" : "text-base")}>
          {label}
        </p>
      )}

      {/* Progress Ring */}
      <div className="relative">
        <svg
          className={cn("transform -rotate-90", compact ? "h-28 w-28" : "h-44 w-44")}
          viewBox="0 0 200 200"
        >
          {/* Background circle */}
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={compact ? 8 : 10}
            className="text-border"
          />
          {/* Progress circle */}
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={compact ? 8 : 10}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={cn(
              "transition-all duration-1000 ease-linear",
              isOvertime ? "text-danger" : isCompleted ? "text-green-600" : "text-primary",
            )}
          />
        </svg>
        {/* Time display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "font-mono font-bold tabular-nums",
              compact ? "text-2xl" : "text-4xl",
              isOvertime && "text-danger",
              isCompleted && "text-green-600",
            )}
          >
            {isOvertime ? "+" : ""}{formatTime(remainingSeconds)}
          </span>
          {isCompleted && !compact && (
            <span className="mt-1 text-sm font-bold text-green-600">Время вышло!</span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleReset}
          title="Сбросить"
        >
          <RotateCcw />
        </Button>
        <Button
          type="button"
          size={compact ? "default" : "lg"}
          onClick={handleStartPause}
          className={cn(isRunning && "bg-amber-600 hover:bg-amber-700")}
        >
          {isRunning ? <Pause /> : <Play />}
          {isRunning ? "Пауза" : isCompleted ? "Заново" : "Старт"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Выйти из полноэкранного режима" : "Во весь экран"}
        >
          {isFullscreen ? <Minimize /> : <Maximize />}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={soundEnabled ? "Выключить звук" : "Включить звук"}
        >
          {soundEnabled ? <Volume2 /> : <VolumeX />}
        </Button>
      </div>

      {/* Duration presets */}
      {!compact && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {PRESET_DURATIONS.map((mins) => (
            <Button
              key={mins}
              type="button"
              variant={totalSeconds === mins * 60 ? "default" : "outline"}
              size="sm"
              onClick={() => handlePreset(mins)}
            >
              {mins} мин
            </Button>
          ))}
        </div>
      )}

      {/* Custom duration */}
      {!compact && (
        <form onSubmit={handleCustomSubmit} className="flex items-center gap-2">
          <Label htmlFor="custom-minutes" className="text-sm text-muted-foreground">
            Своё время:
          </Label>
          <Input
            id="custom-minutes"
            type="number"
            min="1"
            max="180"
            placeholder="мин"
            value={customMinutes}
            onChange={(e) => setCustomMinutes(e.target.value)}
            className="h-9 w-20 text-center"
          />
          <Button type="submit" variant="secondary" size="sm" disabled={!customMinutes}>
            Установить
          </Button>
        </form>
      )}
    </div>
  );
}
