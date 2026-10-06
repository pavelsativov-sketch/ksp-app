"use client";

import { useActionState } from "react";
import { resetPasswordAction, type AuthFormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(resetPasswordAction, {});

  if (!token) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Ссылка неполная: откройте её из письма или запросите новую на странице
        восстановления доступа.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-1.5">
        <Label htmlFor="password">Новый пароль</Label>
        <Input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" />
        <p className="text-xs text-[#8a817a]">Минимум 10 символов.</p>
        {state.fieldErrors?.password && (
          <p className="text-sm text-red-600">{state.fieldErrors.password}</p>
        )}
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Сохраняем…" : "Установить новый пароль"}
      </Button>
    </form>
  );
}