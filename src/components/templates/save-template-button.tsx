"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileStack } from "lucide-react";
import { saveTemplateFromPlan } from "@/app/actions/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import type { LessonPlanRow } from "@/lib/types/ksp";

/**
 * «Сохранить как шаблон» на странице плана.
 *
 * Учитель сохраняет структуру удавшегося урока, чтобы не заполнять те же
 * 13 секций в начале каждой четверти.
 */
export function SaveTemplateButton({ plan }: { plan: LessonPlanRow }) {
  const { t } = useUiLocale();
  const c = t.nav;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${plan.content.topic || plan.title}`);
  const [state, setState] = useState<{ error?: string; info?: string }>({});
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState({});
    startTransition(async () => {
      const res = await saveTemplateFromPlan({
        name: name.trim(),
        subject_id: plan.subject_id,
        grade: plan.grade,
        content: plan.content,
      });
      setState(res);
      if (res.info) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileStack /> {c.templatesSaveCurrent}
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-2 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="tpl-name">{c.templatesTitle}</Label>
        <Input
          id="tpl-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          disabled={pending}
          required
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !name.trim()}>
          {pending ? "…" : c.templatesSaveCurrent}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Отмена
        </Button>
      </div>
      {state.error && <p role="alert" className="w-full text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
