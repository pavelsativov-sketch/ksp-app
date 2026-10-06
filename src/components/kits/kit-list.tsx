"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { deleteKitAction } from "@/app/actions/kits";
import { Button } from "@/components/ui/button";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import type { KitRow } from "@/lib/kits";

const KIND_LABEL: Record<string, string> = {
  worksheet: "Рабочий лист",
  flashcards: "Памятки",
  crossword: "Кроссворд",
};

const KIND_LABEL_KK: Record<string, string> = {
  worksheet: "Жұмыс парағы",
  flashcards: "Жаднамалар",
  crossword: "Сөзжұмбақ",
};

export function KitList({
  kits,
  subjectNames,
  className,
}: {
  kits: KitRow[];
  /**
   * Плоская карта «id предмета → название». Раньше здесь передавалась функция
   * `(id) => name`, но KitList — клиентский компонент, а серверный родитель
   * не может передать ему функцию без директивы "use server": React падал с
   * «Functions cannot be passed directly to Client Components», и вся страница
   * /kits отдавала 500.
   */
  subjectNames: Record<string, string>;
  className: Record<string, string>;
}) {
  const { t, locale } = useUiLocale();
  const c = t.nav;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const labels = locale === "kk" ? KIND_LABEL_KK : KIND_LABEL;

  if (kits.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        {c.kitsEmpty}
      </p>
    );
  }

  function remove(kitId: string) {
    startTransition(async () => {
      const form = new FormData();
      form.set("kitId", kitId);
      const res = await deleteKitAction({}, form);
      setError(res.error ?? null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {kits.map((kit) => (
          <li key={kit.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{kit.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[
                  kit.subject_id ? subjectNames[kit.subject_id] ?? null : null,
                  kit.grade ? `${kit.grade} класс` : null,
                  kit.class_id ? className[kit.class_id] ?? null : null,
                  ...kit.kinds.map((k) => labels[k] ?? k),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline">
                <a href={`/api/kits/${kit.id}/docx`} download>
                  <Download /> {c.kitsOpen}
                </a>
              </Button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  remove(kit.id);
                }}
              >
                <Button type="submit" size="sm" variant="ghost" disabled={pending} aria-label={`${c.kitsDelete}: ${kit.title}`}>
                  <Trash2 />
                </Button>
              </form>
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
