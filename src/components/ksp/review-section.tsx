"use client";

import { useState, useTransition } from "react";
import { Star, Send, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiLocale } from "@/components/i18n/use-ui-locale";

interface Reviewer {
  name: string;
  email: string;
}

interface Review {
  id: string;
  plan_id: string;
  reviewer_id: string;
  rating: number;
  feedback: string;
  created_at: string;
  reviewer: Reviewer;
}

interface Props {
  planId: string;
  initialReviews: Review[];
  initialAverage: number;
  initialCount: number;
  isOwner: boolean;
  canReview: boolean;
}

function timeAgo(iso: string, locale: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (locale === "kk") {
    if (minutes < 1) return "жаңа ғана";
    if (minutes < 60) return `${minutes} мин бұрын`;
    if (hours < 24) return `${hours} сағ бұрын`;
    if (days < 30) return `${days} күн бұрын`;
    return date.toLocaleDateString("kk-KZ");
  }
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  if (hours < 24) return `${hours} ч назад`;
  if (days < 30) return `${days} дн назад`;
  return date.toLocaleDateString("ru-RU");
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-rose-500",
];

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function Avatar({ name, userId }: { name: string; userId: string }) {
  return (
    <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${avatarColor(userId)}`}>
      {getInitial(name)}
    </span>
  );
}

function StarRating({ value, onChange, readonly = false }: { value: number; onChange?: (v: number) => void; readonly?: boolean }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-0.5" role={readonly ? "img" : "radiogroup"} aria-label="Рейтинг">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => !readonly && setHover(star)}
          onMouseLeave={() => !readonly && setHover(0)}
          className={readonly ? "cursor-default" : "cursor-pointer"}
          aria-label={`${star} ${star === 1 ? "звезда" : "звёзд"}`}
        >
          <Star
            className={`size-5 ${
              (hover || value) >= star
                ? "fill-yellow-400 text-yellow-400"
                : "text-gray-300"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export function ReviewSection({ planId, initialReviews, initialAverage, initialCount, isOwner, canReview }: Props) {
  const { locale } = useUiLocale();
  const [reviews, setReviews] = useState<Review[]>(initialReviews);
  const [average, setAverage] = useState(initialAverage);
  const [count, setCount] = useState(initialCount);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  function displayName(review: Review): string {
    return review.reviewer?.name || (locale === "kk" ? "Пайдаланушы" : "Пользователь");
  }

  async function submitReview() {
    if (rating === 0 || !feedback.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId, rating, feedback: feedback.trim() }),
        });
        const data = (await res.json()) as { review?: Review; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Ошибка");
        if (data.review) {
          setReviews((prev) => [data.review!, ...prev]);
          setCount((c) => c + 1);
          setAverage((prev) => Math.round(((prev * count + rating) / (count + 1)) * 10) / 10);
        }
        setRating(0);
        setFeedback("");
      } catch (e) {
        setError(e instanceof Error ? e.message : locale === "kk" ? "Қате" : "Ошибка");
      }
    });
  }

  return (
    <section className="no-print space-y-4">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-left"
        aria-expanded={!collapsed}
      >
        <span className="flex items-center gap-2 font-bold">
          <Star className="size-5" />
          {locale === "kk" ? "Сын-пікірлер" : "Отзывы коллег"}
          <span className="text-sm font-normal text-muted-foreground">({count})</span>
          {count > 0 && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Star className="size-4 fill-yellow-400 text-yellow-400" />
              {average.toFixed(1)}
            </span>
          )}
        </span>
        {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
      </button>

      {!collapsed && (
        <div className="space-y-4">
          {/* Средний рейтинг */}
          {count > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
              <span className="text-3xl font-bold">{average.toFixed(1)}</span>
              <div>
                <StarRating value={Math.round(average)} readonly />
                <p className="text-xs text-muted-foreground">
                  {locale === "kk" ? `${count} баға` : `${count} оценок`}
                </p>
              </div>
            </div>
          )}

          {/* Форма добавления отзыва */}
          {canReview && (
            <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
              <p className="text-sm font-bold">
                {locale === "kk" ? "Өз бағаңызды қалдырыңыз" : "Оставьте свою оценку"}
              </p>
              <StarRating value={rating} onChange={setRating} />
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={locale === "kk" ? "План туралы ойыңыз…" : "Ваш отзыв о плане…"}
                maxLength={2000}
                rows={3}
                className="w-full rounded-md border border-border p-2 text-sm"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={submitReview} disabled={pending || rating === 0 || !feedback.trim()}>
                  <Send className="size-4" />
                  {pending
                    ? locale === "kk" ? "Жіберілуде…" : "Отправка…"
                    : locale === "kk" ? "Жіберу" : "Отправить"}
                </Button>
                {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
              </div>
            </div>
          )}

          {/* Список отзывов */}
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {locale === "kk" ? "Әзір сын-пікір жоқ." : "Пока нет отзывов."}
            </p>
          ) : (
            <div className="space-y-3">
              {reviews.map((review) => (
                <div key={review.id} className="rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-start gap-3">
                    <Avatar name={displayName(review)} userId={review.reviewer_id} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{displayName(review)}</span>
                        <StarRating value={review.rating} readonly />
                        <span className="text-xs text-muted-foreground">{timeAgo(review.created_at, locale)}</span>
                      </div>
                      <p className="mt-1 text-sm whitespace-pre-wrap">{review.feedback}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
