"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, School as SchoolIcon, Users } from "lucide-react";
import { createSchoolAction, joinSchoolAction } from "@/app/actions/school";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/** Создание школы или подключение по коду — оба действия реальные (server actions). */
export default function CreateSchoolPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createSchoolAction(formData);
      if ("error" in result) { setError(result.error); return; }
      router.push("/school/dashboard");
      router.refresh();
    });
  }

  function onJoin(formData: FormData) {
    setError(null);
    const code = String(formData.get("code") ?? "").trim();
    if (!code) { setError("Введите код школы"); return; }
    startTransition(async () => {
      const result = await joinSchoolAction(code);
      if ("error" in result) { setError(result.error); return; }
      router.push("/school/dashboard");
      router.refresh();
    });
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <header className="mb-6 text-center">
        <p className="editorial-kicker">Рабочая область</p>
        <h1 className="editorial-display mt-2 text-3xl">Ваша школа</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Создайте школу, чтобы вести учеников, посещаемость и успеваемость, — или подключитесь по коду, который дал директор.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("create")}
          aria-pressed={mode === "create"}
          className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${mode === "create" ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
        >
          <SchoolIcon className="size-4" /> Создать школу
        </button>
        <button
          type="button"
          onClick={() => setMode("join")}
          aria-pressed={mode === "join"}
          className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${mode === "join" ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
        >
          <Users className="size-4" /> По коду
        </button>
      </div>

      {mode === "create" ? (
        <form action={onCreate} className="space-y-3 rounded-2xl border border-border bg-surface p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Название школы"><Input name="name" required minLength={2} placeholder="Школа-лицей №25" /></Field>
            <Field label="Код школы (для подключения учителей)"><Input name="code" required minLength={3} placeholder="SCH-2026-25" /></Field>
            <Field label="Область"><Input name="region" required minLength={2} placeholder="Костанайская" /></Field>
            <Field label="Город"><Input name="city" required minLength={2} placeholder="Костанай" /></Field>
            <Field label="Учебный год"><Input name="academic_year" placeholder="2026-2027" /></Field>
            <Field label="Язык обучения">
              <select name="language" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="ru">Русский</option>
                <option value="kk">Қазақша</option>
              </select>
            </Field>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Создать школу
          </Button>
        </form>
      ) : (
        <form action={onJoin} className="space-y-3 rounded-2xl border border-border bg-surface p-5">
          <Field label="Код школы">
            <Input name="code" required minLength={3} placeholder="SCH-2026-25" className="text-center font-mono text-lg tracking-widest" />
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Присоединиться как учитель
          </Button>
        </form>
      )}

      {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
