"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileStack, Trash2 } from "lucide-react";
import { deleteTemplateAction } from "@/app/actions/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import type { TemplateRow } from "@/lib/templates";

/**
 * Список шаблонов КСП.
 *
 * Применение шаблона создаёт черновик: учителю остаётся вписать тему и
 * содержание, но структура (цели, формулировки, критерии) уже на месте.
 */
export function TemplatesManager({
  templates,
  subjects,
  onUse,
}: {
  templates: TemplateRow[];
  subjects: Array<{ id: string; name_ru: string }>;
  /** Переход в конструктор с предзаполненным шаблоном и указанной темой. */
  onUse?: (templateId: string, topic: string) => void;
}) {
  const { t } = useUiLocale();
  const c = t.nav;
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [state, setState] = useState<{ error?: string; info?: string }>({});
  const [pending, startTransition] = useTransition();

  const subjectName = (id: string | null) =>
    id ? subjects.find((s) => s.id === id)?.name_ru ?? null : null;

  return (
    <section aria-labelledby="templates-title" className="space-y-5">
      <div>
        <p className="editorial-kicker">{c.templatesTitle}</p>
        <h2 id="templates-title" className="text-xl font-semibold">{c.templatesLead}</h2>
      </div>

      {templates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {c.templatesEmpty}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {templates.map((tpl) => {
            const subject = subjectName(tpl.subject_id);
            return (
              <li key={tpl.id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
                <div className="flex items-start gap-2">
                  <FileStack className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{tpl.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {subject ?? "—"}
                      {tpl.grade ? ` · ${tpl.grade} класс` : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-auto flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    disabled={!onUse || !topic.trim() || pending}
                    onClick={() => {
                      // Конструктор подставит структуру шаблона под указанную тему.
                      onUse?.(tpl.id, topic.trim());
                    }}
                  >
                    {c.templatesUse}
                  </Button>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      startTransition(async () => {
                        const form = new FormData();
                        form.set("templateId", tpl.id);
                        setState(await deleteTemplateAction({}, form));
                        router.refresh();
                      });
                    }}
                  >
                    <Button type="submit" size="sm" variant="ghost" disabled={pending} aria-label={`${c.templatesDelete}: ${tpl.name}`}>
                      <Trash2 />
                    </Button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {onUse && (
        <div className="space-y-2 rounded-xl border border-border bg-surface p-4">
          <Label htmlFor="tpl-topic">{c.templatesUse}</Label>
          <Input
            id="tpl-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Тема нового урока"
            maxLength={300}
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">
            Сначала укажите тему — она не хранится в шаблоне, потому что у каждого урока своя.
          </p>
        </div>
      )}

      {state.error && <p role="alert" className="text-xs text-red-600">{state.error}</p>}
      {state.info && <p role="status" className="text-xs text-green-700">{state.info}</p>}
    </section>
  );
}
