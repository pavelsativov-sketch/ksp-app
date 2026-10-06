"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FeedbackCategory = "bug" | "feature" | "general";

interface FeedbackFormProps {
  userId: string;
  onSuccess?: () => void;
}

const categories: { value: FeedbackCategory; label: string }[] = [
  { value: "bug", label: "Сообщить об ошибке" },
  { value: "feature", label: "Предложить функцию" },
  { value: "general", label: "Общий отзыв" },
];

export function FeedbackForm({ userId, onSuccess }: FeedbackFormProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError("Пожалуйста, выберите оценку");
      return;
    }
    if (comment.trim().length < 10) {
      setError("Пожалуйста, напишите чуть подробнее (минимум 10 символов)");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment.trim(), category }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка отправки");
      }

      setSubmitted(true);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка отправки");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-semibold">Спасибо за отзыв!</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Ваш отзыв помогает нам делать Mekty лучше.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Star Rating */}
      <div className="space-y-2">
        <Label>Ваша оценка</Label>
        <div className="flex gap-1" role="radiogroup" aria-label="Оценка">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoveredRating(star)}
              onMouseLeave={() => setHoveredRating(0)}
              className="rounded p-1 transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`${star} из 5`}
              aria-pressed={rating === star}
            >
              <Star
                className={cn(
                  "h-8 w-8 transition-colors",
                  (hoveredRating || rating) >= star
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-muted-foreground",
                )}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label>Категория</Label>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                category === cat.value
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface text-foreground hover:border-primary hover:text-primary",
              )}
              aria-pressed={category === cat.value}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Comment */}
      <div className="space-y-2">
        <Label htmlFor="feedback-comment">Комментарий</Label>
        <Textarea
          id="feedback-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Расскажите подробнее..."
          rows={5}
          maxLength={5000}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground">{comment.length} / 5000</p>
      </div>

      {/* Error */}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Submit */}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Отправка..." : "Отправить отзыв"}
      </Button>
    </form>
  );
}
