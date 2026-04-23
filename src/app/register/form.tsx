"use client";

import { useActionState } from "react";
import { registerAction, type AuthFormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegisterForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    registerAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="fullName">ФИО</Label>
        <Input
          id="fullName"
          name="fullName"
          required
          autoComplete="name"
          placeholder="Иванов Иван Иванович"
        />
        {state.fieldErrors?.fullName && (
          <p className="text-sm text-red-600">{state.fieldErrors.fullName}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
        {state.fieldErrors?.email && (
          <p className="text-sm text-red-600">{state.fieldErrors.email}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={6}
        />
        {state.fieldErrors?.password && (
          <p className="text-sm text-red-600">{state.fieldErrors.password}</p>
        )}
      </div>
      {state.error && (
        <p className="text-sm text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Регистрация…" : "Создать аккаунт"}
      </Button>
    </form>
  );
}
