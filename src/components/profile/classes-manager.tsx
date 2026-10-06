"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAllGradesAction, addClassAction, deleteClassAction, renameClassAction } from "@/app/actions/classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import type { TeacherClass } from "@/lib/classes";

/**
 * Классы и группы учителя.
 *
 * Название остаётся свободным текстом: в школах это «5-А», но также
 * «7б», «5 «А» с укрупнением» и кружки. Класс (1–11) выбирается отдельно и
 * нужен для подсчёта нагрузки и группировки.
 */
export function ClassesManager({ classes }: { classes: TeacherClass[] }) {
  const { t } = useUiLocale();
  const c = t.classes;
  const router = useRouter();
  const [name, setName] = useState("");
  const [grade, setGrade] = useState<string>("");
  const [letter, setLetter] = useState("");
  const [state, setState] = useState<{ error?: string; info?: string }>({});
  const [pending, startTransition] = useTransition();

  function submit(action: (prev: typeof state, form: FormData) => Promise<typeof state>) {
    return (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setState({});
      startTransition(async () => {
        const res = await action(state, new FormData(e.currentTarget));
        setState(res);
        router.refresh();
      });
    };
  }

  const canAdd = name.trim().length > 0;

  return (
    <section aria-labelledby="classes-title" className="space-y-4">
      <div>
        <p className="editorial-kicker">{c.kicker}</p>
        <h2 id="classes-title" className="text-xl font-semibold">{c.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{c.lead}</p>
      </div>

      <form className="space-y-3 rounded-xl border border-border bg-surface p-4" onSubmit={submit(addClassAction)}>
        <div className="grid gap-3 sm:grid-cols-[1fr_9rem_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="class-name">{c.nameLabel}</Label>
            <Input
              id="class-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={c.namePh}
              maxLength={60}
              disabled={pending}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="class-grade">{c.gradeLabel}</Label>
            <select
              id="class-grade"
              name="grade"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              disabled={pending}
              className="h-10 w-full rounded-control border border-border bg-surface px-3 text-sm"
            >
              <option value="">{c.notAClass}</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={pending || !canAdd}>{pending ? c.saving : c.add}</Button>
          </div>
        </div>
        {state.error && <p role="alert" className="text-xs text-red-600">{state.error}</p>}
        {state.info && <p role="status" className="text-xs text-green-700">{state.info}</p>}
      </form>

      <details className="rounded-xl border border-border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium">{c.bulkTitle}</summary>
        <p className="mt-2 text-xs text-muted-foreground">{c.bulkLead}</p>
        <form className="mt-3 flex items-end gap-2" onSubmit={submit(addAllGradesAction)}>
          <div className="w-28 space-y-1.5">
            <Label htmlFor="class-letter">{c.letterLabel}</Label>
            <Input id="class-letter" name="letter" value={letter} onChange={(e) => setLetter(e.target.value)} placeholder={c.letterPh} maxLength={3} disabled={pending} />
          </div>
          <Button type="submit" variant="outline" disabled={pending}>{c.bulkAdd}</Button>
        </form>
      </details>

      {classes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {c.empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {classes.map((cls) => (
            <ClassRow key={cls.id} cls={cls} disabled={pending} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ClassRow({ cls, disabled }: { cls: TeacherClass; disabled: boolean }) {
  const { t } = useUiLocale();
  const c = t.classes;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(cls.name);
  const [state, setState] = useState<{ error?: string; info?: string }>({});
  const [pending, startTransition] = useTransition();

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      {editing ? (
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const form = new FormData();
              form.set("classId", cls.id);
              form.set("name", value);
              setState(await renameClassAction({}, form));
              setEditing(false);
              router.refresh();
            });
          }}
        >
          <Input
            aria-label={c.nameLabel}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={60}
            autoFocus
            disabled={pending}
          />
          <Button type="submit" size="sm" disabled={pending}>{c.save}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setValue(cls.name); setEditing(false); }} disabled={pending}>
            {c.cancel}
          </Button>
        </form>
      ) : (
        <>
          <span className="flex-1 font-medium">{cls.name}</span>
          {cls.grade === null && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{c.groupBadge}</span>
          )}
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)} disabled={disabled}>
            {c.rename}
          </Button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const form = new FormData();
                form.set("classId", cls.id);
                setState(await deleteClassAction({}, form));
                router.refresh();
              });
            }}
          >
            <Button type="submit" size="sm" variant="ghost" disabled={disabled}>{c.delete}</Button>
          </form>
        </>
      )}
      {state.error && <p role="alert" className="w-full text-xs text-red-600">{state.error}</p>}
      {state.info && <p role="status" className="w-full text-xs text-green-700">{state.info}</p>}
    </li>
  );
}
