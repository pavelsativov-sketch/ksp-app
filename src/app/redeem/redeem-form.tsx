"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { redeemActivationCodeAction } from "@/app/actions/billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RedeemForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successUntil, setSuccessUntil] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (successUntil) {
    const until = new Date(successUntil).toLocaleDateString("ru-RU", {
      day: "numeric", month: "long", year: "numeric",
    });
    return (
      <div className="rounded-xl border border-[#15803d33] bg-[#15803d0d] p-4 text-sm text-[#14532d]">
        <p className="font-semibold">Готово! Тариф «Учитель Pro» активирован.</p>
        <p className="mt-1">Действует до {until}. Приятной работы — теперь без лимитов и водяных знаков.</p>
        <Button className="mt-4 w-full" onClick={() => router.push("/dashboard")}>
          Перейти к планам
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await redeemActivationCodeAction(code);
          if (result.ok) {
            setSuccessUntil(result.expiresAt.toISOString());
          } else {
            setError(result.error);
          }
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="code">Код активации</Label>
        <Input
          id="code"
          name="code"
          required
          autoComplete="off"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="XXXX-XXXX-XXXX"
          className="font-mono uppercase"
        />
        <p className="text-xs text-muted-foreground">
          Код выдаётся после оплаты (Kaspi / карта). Вводите без пробелов — регистр не важен.
        </p>
      </div>
      {error && <p className="text-sm text-[#dc2626]">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Активируем…" : "Активировать"}
      </Button>
    </form>
  );
}
