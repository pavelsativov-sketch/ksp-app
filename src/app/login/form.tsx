"use client";

import { useActionState } from "react";
import { loginAction, type AuthFormState } from "@/app/actions/auth";
import { AuthField, AuthMessage, AuthSubmit, PasswordField } from "@/components/auth/auth-fields";
import s from "@/components/auth/auth.module.css";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(loginAction, {});

  return (
    <form action={action} className={s.form}>
      {next && <input type="hidden" name="next" value={next} />}
      <AuthField id="email" name="email" type="email" label="Email" required autoComplete="email" inputMode="email" placeholder="teacher@school.kz" error={state.fieldErrors?.email} />
      <PasswordField id="password" name="password" label="Пароль" autoComplete="current-password" error={state.fieldErrors?.password} />
      <AuthMessage error={state.error} info={state.info} />
      <AuthSubmit pending={pending} idle="Войти" busy="Входим…" />
    </form>
  );
}
