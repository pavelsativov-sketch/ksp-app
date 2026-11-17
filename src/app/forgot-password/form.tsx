"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, type AuthFormState } from "@/app/actions/auth";
import { AuthField, AuthMessage, AuthSubmit } from "@/components/auth/auth-fields";
import s from "@/components/auth/auth.module.css";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(requestPasswordResetAction, {});

  if (state.info) {
    return (
      <div className={s.form}>
        <AuthMessage info={state.info} />
        <Link href="/login" className={s.submit}>Вернуться ко входу</Link>
      </div>
    );
  }

  return (
    <form action={action} className={s.form}>
      <AuthField id="email" name="email" type="email" label="Email" required autoComplete="email" inputMode="email" placeholder="teacher@school.kz" error={state.fieldErrors?.email} />
      <AuthMessage error={state.error} />
      <AuthSubmit pending={pending} idle="Отправить ссылку" busy="Отправляем…" />
    </form>
  );
}
