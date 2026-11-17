"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import s from "./admin.module.css";

interface Pending { summary: string; url: string; body: Record<string, unknown>; destructive?: boolean }

/** Любое действие сначала показывает диалог подтверждения, затем POST в админ-API. */
function useConfirmedPost() {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const response = await fetch(pending.url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pending.body),
      });
      const json = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (response.ok && json?.ok) {
        setStatus({ ok: true, text: "Готово. Изменение записано в журнал." });
        router.refresh();
      } else {
        setStatus({ ok: false, text: json?.error ?? "Не удалось применить изменение." });
      }
    } catch {
      setStatus({ ok: false, text: "Ответ не получен. Обновите страницу и проверьте журнал перед повтором." });
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const dialog = <Dialog open={!!pending} onOpenChange={(open) => { if (!open && !busy) setPending(null); }}>
    <DialogContent className={s.dialog}>
      <DialogTitle className="text-lg font-bold">Подтвердите действие</DialogTitle>
      <DialogDescription>{pending?.summary}</DialogDescription>
      <div className={s.actions}>
        <DialogClose asChild><Button variant="outline" disabled={busy}>Отмена</Button></DialogClose>
        <Button variant={pending?.destructive ? "destructive" : "default"} disabled={busy} onClick={apply}>{busy ? "Применяем…" : "Применить"}</Button>
      </div>
    </DialogContent>
  </Dialog>;

  const message = status && <p role={status.ok ? "status" : "alert"} className={status.ok ? s.ok : s.error}>{status.text}</p>;
  return { ask: (next: Pending) => { setStatus(null); setPending(next); }, dialog, message };
}

export function BonusForm({ userId, email }: { userId: string; email: string }) {
  const { ask, dialog, message } = useConfirmedPost();
  return <>
    <form className={s.form} onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const amount = Number(form.get("amount"));
      const scope = form.get("scope") === "permanent" ? "permanent" : "month";
      if (!Number.isInteger(amount) || amount === 0) return;
      const what = `${amount > 0 ? "+" : ""}${amount} КСП ${scope === "permanent" ? "к лимиту каждого месяца" : "только в этом месяце"}`;
      ask({ summary: `${email}: ${what}.`, url: `/api/admin/users/${userId}/tokens`, body: { amount, scope }, destructive: amount < 0 });
    }}>
      <label className={s.field}>Количество
        <input name="amount" type="number" required min={-1000} max={1000} step={1} defaultValue={5} className={`${s.input} w-28`} />
      </label>
      <label className={s.field}>Срок
        <select name="scope" defaultValue="month" className={s.input}>
          <option value="month">Этот месяц</option>
          <option value="permanent">Каждый месяц</option>
        </select>
      </label>
      <Button type="submit">Выдать</Button>
    </form>
    <p className={s.small}>Отрицательное число уменьшает бонус (не ниже нуля).</p>
    {message}{dialog}
  </>;
}

export function SubscriptionForm({ userId, email, isPro }: { userId: string; email: string; isPro: boolean }) {
  const { ask, dialog, message } = useConfirmedPost();
  const [mode, setMode] = useState<"extend" | "until">("extend");
  const url = `/api/admin/users/${userId}/subscription`;
  return <>
    <form className={s.form} onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      if (mode === "extend") {
        const months = Number(form.get("months"));
        ask({ summary: `${email}: Pro на ${months} мес. (продление от текущего окончания).`, url, body: { action: "extend", plan: "pro", months } });
      } else {
        const until = String(form.get("until") ?? "");
        if (!until) return;
        ask({ summary: `${email}: Pro до ${until} включительно (UTC).`, url, body: { action: "until", plan: "pro", until } });
      }
    }}>
      <label className={s.field}>Тариф
        <select name="plan" defaultValue="pro" className={s.input}><option value="pro">Pro</option></select>
      </label>
      <label className={s.field}>Как задать срок
        <select value={mode} onChange={(e) => setMode(e.target.value === "until" ? "until" : "extend")} className={s.input}>
          <option value="extend">На срок</option>
          <option value="until">До даты</option>
        </select>
      </label>
      {mode === "extend"
        ? <label className={s.field}>Срок
          <select name="months" defaultValue="1" className={s.input}><option value="1">1 месяц</option><option value="3">3 месяца</option><option value="12">12 месяцев</option></select>
        </label>
        : <label className={s.field}>Дата окончания
          <input name="until" type="date" required className={s.input} />
        </label>}
      <Button type="submit">Применить</Button>
      {isPro && <Button type="button" variant="destructive" onClick={() => ask({
        summary: `${email}: снять Pro сейчас. Пользователь перейдёт на Free.`, url, body: { action: "revoke" }, destructive: true,
      })}>Снять подписку</Button>}
    </form>
    {message}{dialog}
  </>;
}
