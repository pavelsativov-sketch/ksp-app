"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction, type AuthFormState } from "@/app/actions/auth";
import { AuthField, AuthMessage, AuthSubmit, PasswordField } from "@/components/auth/auth-fields";
import s from "@/components/auth/auth.module.css";

export function RegisterForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(registerAction, {});

  return (
    <form action={action} className={s.form}>
      <AuthField id="fullName" name="fullName" label="ФИО" required autoComplete="name" placeholder="Иванова Айгерим Сериковна" hint="Так подпишем ваши КСП и материалы" error={state.fieldErrors?.fullName} />
      <AuthField id="email" name="email" type="email" label="Email" required autoComplete="email" inputMode="email" placeholder="teacher@school.kz" error={state.fieldErrors?.email} />
      <PasswordField id="password" name="password" label="Пароль" autoComplete="new-password" minLength={10} error={state.fieldErrors?.password} />
      <p className={s.consent}>Регистрируясь, вы соглашаетесь с <Link href="/terms">условиями</Link> и <Link href="/privacy">политикой конфиденциальности</Link>.</p>
      <AuthMessage error={state.error} info={state.info} />
      <AuthSubmit pending={pending} idle="Создать аккаунт" busy="Создаём аккаунт…" />
    </form>
  );
}
