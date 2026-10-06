"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createAdminCodeAction, createAdminCodesBulkAction, grantProAction, revokeAdminCodeAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";

export function CreateCodeForm() {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [secret, setSecret] = useState<{ id: string; plaintext: string } | null>(null);
  useEffect(() => {
    const hide = () => setSecret(null);
    window.addEventListener("pagehide", hide);
    return () => window.removeEventListener("pagehide", hide);
  }, []);
  return <div className="space-y-4 rounded-xl border border-border p-5">
    <h3 className="text-lg font-semibold">Создать код активации</h3>
    <p className="text-sm text-muted-foreground">Код показывается только после создания. После скрытия или ухода со страницы восстановить его нельзя.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={async (event) => {
      event.preventDefault();
      if (busy.current || secret) return;
      const type = new FormData(event.currentTarget).get("type");
      busy.current = true; setPending(true); setError("");
      try {
        const result = await createAdminCodeAction({ type });
        if (result.ok) { setSecret({ id: result.id, plaintext: result.plaintext }); router.refresh(); }
        else setError(result.error);
      } catch { setError("Ответ не получен. Обновите список перед повтором: код мог быть создан."); }
      finally { busy.current = false; setPending(false); }
    }}>
      <label className="grid gap-1 text-sm">Срок Pro
        <select name="type" disabled={pending || !!secret} className="rounded-md border border-border bg-background p-2">
          <option value="pro_1m">1 месяц</option><option value="pro_3m">Четверть (3 мес.)</option><option value="pro_1y">1 год</option>
        </select>
      </label>
      <Button type="submit" disabled={pending || !!secret}>{pending ? "Создание…" : "Создать один код"}</Button>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {secret && <div className="space-y-3 rounded-md border border-border bg-muted p-4">
      <p className="font-medium">Сохраните код сейчас. Повторный просмотр недоступен.</p>
      <p className="text-xs">ID: {secret.id}</p>
      <label className="grid gap-2 text-sm">Новый код
        <textarea readOnly value={secret.plaintext} autoComplete="off" spellCheck={false} className="w-full break-all rounded border border-border bg-background p-3 font-mono" onFocus={(event) => event.currentTarget.select()} />
      </label>
      <Button type="button" variant="outline" onClick={() => setSecret(null)}>Я сохранил код — скрыть</Button>
    </div>}
  </div>;
}

export function RevokeCodeButton({ id }: { id: string }) {
  const router = useRouter();
  const busy = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  if (done) return <span role="status">Отозван</span>;
  return <div className="space-y-2">
    {!confirming ? <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>Отозвать</Button> : <>
      <p className="text-xs">Отозвать код без возможности отмены?</p>
      <div className="flex gap-2"><Button size="sm" disabled={pending} onClick={async () => {
        if (busy.current) return;
        busy.current = true; setPending(true); setError("");
        try {
          const result = await revokeAdminCodeAction({ id });
          if (result.ok) { setDone(true); router.refresh(); }
          else { setError(result.error); if (result.status === 409) router.refresh(); }
        } catch { setError("Ответ не получен. Обновите список."); }
        finally { busy.current = false; setPending(false); }
      }}>{pending ? "Отзыв…" : "Подтвердить"}</Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>Отмена</Button></div>
    </>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}

/** Пакетное создание кодов (до 20): список показывается один раз. */
export function BulkCodesForm() {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [secrets, setSecrets] = useState<Array<{ id: string; plaintext: string }> | null>(null);
  useEffect(() => {
    const hide = () => setSecrets(null);
    window.addEventListener("pagehide", hide);
    return () => window.removeEventListener("pagehide", hide);
  }, []);
  return <div className="space-y-4 rounded-xl border border-border p-5">
    <h3 className="text-lg font-semibold">Создать пакет кодов</h3>
    <p className="text-sm text-muted-foreground">До 20 кодов за раз. Список показывается один раз — скопируйте сразу.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={async (event) => {
      event.preventDefault();
      if (busy.current || secrets) return;
      const form = new FormData(event.currentTarget);
      busy.current = true; setPending(true); setError("");
      try {
        const result = await createAdminCodesBulkAction({ type: form.get("type"), count: form.get("count") });
        if (result.ok) { setSecrets(result.codes); router.refresh(); }
        else setError(result.error);
      } catch { setError("Ответ не получен. Обновите список перед повтором: коды могли быть созданы."); }
      finally { busy.current = false; setPending(false); }
    }}>
      <label className="grid gap-1 text-sm">Срок Pro
        <select name="type" disabled={pending || !!secrets} className="rounded-md border border-border bg-background p-2">
          <option value="pro_1m">1 месяц</option><option value="pro_3m">Четверть (3 мес.)</option><option value="pro_1y">1 год</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">Количество
        <input name="count" type="number" min={1} max={20} defaultValue={5} disabled={pending || !!secrets} className="w-24 rounded-md border border-border bg-background p-2" />
      </label>
      <Button type="submit" disabled={pending || !!secrets}>{pending ? "Создание…" : "Создать пакет"}</Button>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {secrets && <div className="space-y-3 rounded-md border border-border bg-muted p-4">
      <p className="font-medium">Сохраните коды сейчас. Повторный просмотр недоступен.</p>
      <textarea readOnly value={secrets.map((s) => s.plaintext).join("\n")} rows={Math.min(20, secrets.length + 1)} autoComplete="off" spellCheck={false} className="w-full break-all rounded border border-border bg-background p-3 font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
      <Button type="button" variant="outline" onClick={() => setSecrets(null)}>Я сохранил коды — скрыть</Button>
    </div>}
  </div>;
}

/** Ручная выдача Pro по email (продажи без онлайн-оплаты): продлевает текущий срок. */
export function GrantProForm() {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  return <div className="space-y-4 rounded-xl border border-border p-5">
    <h3 className="text-lg font-semibold">Выдать Pro вручную</h3>
    <p className="text-sm text-muted-foreground">По email пользователя. Срок продлевается от текущего окончания.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={async (event) => {
      event.preventDefault();
      if (busy.current) return;
      const form = new FormData(event.currentTarget);
      busy.current = true; setPending(true); setError(""); setDone("");
      try {
        const result = await grantProAction({ email: form.get("email"), type: form.get("type") });
        if (result.ok) {
          setDone(`${result.email} — Pro до ${new Date(result.expiresAt).toLocaleDateString("ru-RU")}`);
          router.refresh();
        } else setError(result.error);
      } catch { setError("Ответ не получен. Проверьте список пользователей."); }
      finally { busy.current = false; setPending(false); }
    }}>
      <label className="grid gap-1 text-sm">Email пользователя
        <input name="email" type="email" required maxLength={200} disabled={pending} className="w-72 max-w-full rounded-md border border-border bg-background p-2" />
      </label>
      <label className="grid gap-1 text-sm">Срок
        <select name="type" disabled={pending} className="rounded-md border border-border bg-background p-2">
          <option value="pro_1m">1 месяц</option><option value="pro_3m">Четверть (3 мес.)</option><option value="pro_1y">1 год</option>
        </select>
      </label>
      <Button type="submit" disabled={pending}>{pending ? "Выдача…" : "Выдать Pro"}</Button>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {done && <p role="status" className="text-sm font-medium">{done}</p>}
  </div>;
}
