"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  planId: string;
  initialLikes: number;
  initiallyLiked: boolean;
  canLike: boolean;
}

/** Кнопка лайка плана (в библиотеке / на странице просмотра). */
export function LikeButton({ planId, initialLikes, initiallyLiked, canLike }: Props) {
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(initiallyLiked);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    if (!canLike || pending) return;
    // Оптимистичное обновление; при ошибке откатываем.
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikes((n) => n + (nextLiked ? 1 : -1));
    startTransition(async () => {
      try {
        const res = await fetch(`/api/plans/${planId}/like`, { method: "POST" });
        const data = (await res.json()) as { liked?: boolean; likes?: number; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Ошибка");
        setLiked(Boolean(data.liked));
        setLikes(data.likes ?? 0);
        setError(null);
      } catch (e) {
        setLiked((prev) => !prev);
        setLikes((n) => n + (liked ? 1 : -1));
        setError(e instanceof Error ? e.message : "Ошибка");
      }
    });
  }

  if (!canLike) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-[#6b7480]">
        <Heart className="size-4" /> {likes}
      </span>
    );
  }

  return (
    <span className="relative inline-flex items-center">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={toggle}
        disabled={pending}
        title={liked ? "Убрать лайк" : "Полезный план"}
        className={liked ? "text-[#c0512f] border-[#c0512f]" : ""}
      >
        <Heart className={liked ? "size-4 fill-current" : "size-4"} /> {likes}
      </Button>
      {error && <span className="absolute -bottom-5 right-0 text-xs text-red-600">{error}</span>}
    </span>
  );
}