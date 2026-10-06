"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changePasswordAction, deleteAccountAction, updateProfileAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type State = { error?: string; fieldErrors?: Record<string, string>; info?: string };
const initial: State = {};

function FieldError({ errors, name }: { errors?: Record<string, string>; name: string }) {
  if (!errors?.[name]) return null;
  return <p role="alert" className="text-xs text-red-600">{errors[name]}</p>;
}

/** Смена отображаемого имени. */
export function ProfileNameForm({ defaultName }: { defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const [state, setState] = useState<State>(initial);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setState(initial);
        startTransition(async () => {
          const form = new FormData();
          form.set("fullName", name);
          setState(await updateProfileAction(initial, form));
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="profile-name">Имя</Label>
        <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} disabled={pending} />
        <FieldError errors={state.fieldErrors} name="fullName" />
      </div>
      {state.error && <p role="alert" className="text-xs text-red-600">{state.error}</p>}
      {state.info && <p role="status" className="text-xs text-green-700">{state.info}</p>}
      <Button type="submit" disabled={pending} variant="outline">{pending ? "Сохранение…" : "Сохранить имя"}</Button>
    </form>
  );
}

/** Смена пароля: текущий + новый. */
export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [state, setState] = useState<State>(initial);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setState(initial);
        startTransition(async () => {
          const form = new FormData();
          form.set("currentPassword", current);
          form.set("password", next);
          const result = await changePasswordAction(initial, form);
          setState(result);
          if ("info" in result) {
            setCurrent("");
            setNext("");
          }
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="pw-current">Текущий пароль</Label>
        <Input id="pw-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} disabled={pending} autoComplete="current-password" />
        <FieldError errors={state.fieldErrors} name="currentPassword" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pw-next">Новый пароль (минимум 10 символов)</Label>
        <Input id="pw-next" type="password" value={next} onChange={(e) => setNext(e.target.value)} disabled={pending} autoComplete="new-password" />
        <FieldError errors={state.fieldErrors} name="password" />
      </div>
      {state.error && <p role="alert" className="text-xs text-red-600">{state.error}</p>}
      {state.info && <p role="status" className="text-xs text-green-700">{state.info}</p>}
      <Button type="submit" disabled={pending} variant="outline">{pending ? "Смена…" : "Сменить пароль"}</Button>
    </form>
  );
}

/** Удаление аккаунта: пароль + слово УДАЛИТЬ. */
export function DeleteAccountForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<State>(initial);
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} className="border-red-300 text-red-700 hover:bg-red-50">
        Удалить аккаунт
      </Button>
    );
  }
  return (
    <form
      className="space-y-3 rounded-xl border border-red-200 bg-red-50/50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setState(initial);
        startTransition(async () => {
          const form = new FormData();
          form.set("password", password);
          form.set("confirm", confirm);
          const result = await deleteAccountAction(initial, form);
          // Успех = redirect, сюда не возвращаемся.
          setState(result);
          router.refresh();
        });
      }}
    >
      <p className="text-sm font-medium">Удалить аккаунт и все данные без возможности восстановления?</p>
      <p className="text-xs text-slate-600">Удалятся профиль, планы, черновики, учебники и жалобы. Для подтверждения введите пароль и слово УДАЛИТЬ.</p>
      <div className="space-y-1.5">
        <Label htmlFor="del-pw">Пароль</Label>
        <Input id="del-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={pending} autoComplete="current-password" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="del-confirm">Введите УДАЛИТЬ</Label>
        <Input id="del-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={pending} />
        <FieldError errors={state.fieldErrors} name="confirm" />
      </div>
      {state.error && <p role="alert" className="text-xs text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="bg-red-700 hover:bg-red-800">{pending ? "Удаление…" : "Удалить навсегда"}</Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Отмена</Button>
      </div>
    </form>
  );
}
