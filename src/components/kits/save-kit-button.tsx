"use client";

import { useState, useTransition } from "react";
import { FolderPlus, Loader2 } from "lucide-react";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import type { Handout } from "@/lib/handouts/types";

/** Заголовок материала — есть не у всех видов. */
function handoutTitle(handout: Handout): string {
  return "title" in handout && typeof handout.title === "string" ? handout.title : "";
}

function handoutTopic(handout: Handout): string {
  // metaLine у листа начинается с класса, тема лежит в заголовке.
  return handoutTitle(handout);
}

/**
 * «Сохранить комплект» в предпросмотре материала.
 *
 * Кладёт сгенерированные материалы в архив, чтобы скачать их позже одним
 * Word-файлом и переиспользовать без новой генерации (а значит, без траты
 * квоты AI).
 */
export function SaveKitButton({
  handout,
  extra,
  title,
  topic,
  classId = null,
  grade = null,
  subjectId = null,
}: {
  handout: Handout;
  extra?: Handout | null;
  title: string;
  topic: string;
  classId?: string | null;
  grade?: number | null;
  subjectId?: string | null;
}) {
  const { t } = useUiLocale();
  const c = t.nav;
  const [state, setState] = useState<{ error?: string; done?: boolean }>({});
  const [pending, startTransition] = useTransition();

  function save() {
    setState({});
    startTransition(async () => {
      try {
        const res = await fetch("/api/kits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title || topic || c.kitsTitle,
            topic,
            subject_id: subjectId,
            grade,
            class_id: classId,
            handouts: [handout],
            extra: extra ?? null,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setState({ error: data?.error ?? "Не удалось сохранить комплект" });
          return;
        }
        setState({ done: true });
        // Список комплектов обновится при следующем переходе на /kits.
      } catch {
        setState({ error: "Сеть недоступна. Попробуйте позже." });
      }
    });
  }

  if (state.done) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-sm text-white">
        {c.kitsSaved}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/25 disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />}
        {c.kitsSave}
      </button>
      {state.error && (
        <span role="alert" className="basis-full px-4 pb-1 text-xs text-red-200">{state.error}</span>
      )}
    </>
  );
}

/** Заголовок материала для подписи комплекта. */
export function docTitle(handout: Handout): string {
  return handoutTitle(handout);
}

/** Тема урока для подписи комплекта. */
export function docTopic(handout: Handout): string {
  return handoutTopic(handout);
}
