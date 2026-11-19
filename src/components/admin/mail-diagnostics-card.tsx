"use client";

import { useState } from "react";
import { Bell, CheckCircle2, Loader2, Mail, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Channel = "email" | "telegram" | "in_app";

export function MailDiagnosticsCard({
  resendConfigured,
  telegramConfigured,
}: {
  resendConfigured: boolean;
  telegramConfigured: boolean;
}) {
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState<Channel | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function runTest(channel: Channel) {
    if (busy) return;
    setBusy(channel);
    setResult(null);
    try {
      const res = await fetch("/api/admin/mail-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          ...(channel === "email" && testEmail.trim() ? { to: testEmail.trim() } : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        detail?: string;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        setResult({ ok: false, text: json?.error ?? "Не удалось выполнить проверку" });
      } else {
        setResult({ ok: true, text: json.detail ?? "Доставлено успешно" });
      }
    } catch {
      setResult({ ok: false, text: "Ошибка сети при проверке доставки" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">Почта и уведомления в продакшене</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Проверьте живую доставку писем (Resend), Telegram-алертов и встроенного колокольчика для новых заявок Pro/Школа и сброса пароля.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${
              resendConfigured
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
            }`}
          >
            {resendConfigured ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
            Resend Email
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${
              telegramConfigured
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {telegramConfigured ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
            Telegram Бот
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-3.5" /> Колокольчик (MongoDB)
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="email"
          value={testEmail}
          onChange={(e) => setTestEmail(e.target.value)}
          placeholder="Email для теста (по умолчанию — email админа)"
          className="max-w-xs text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => void runTest("email")}
        >
          {busy === "email" ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
          Тест письма (Resend)
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => void runTest("telegram")}
        >
          {busy === "telegram" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          Тест Telegram
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => void runTest("in_app")}
        >
          {busy === "in_app" ? <Loader2 className="size-3.5 animate-spin" /> : <Bell className="size-3.5" />}
          Тест колокольчика
        </Button>
      </div>

      {result && (
        <div
          role="status"
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
            result.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200"
          }`}
        >
          {result.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}
          <span>{result.text}</span>
        </div>
      )}

      {(!resendConfigured || !telegramConfigured) && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Для включения внешней доставки добавьте в Vercel → Settings → Environment Variables (Production):{" "}
          {!resendConfigured && (
            <>
              <code className="rounded bg-muted px-1 py-0.5 font-mono">RESEND_API_KEY</code> и{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">MAIL_FROM</code> (напр.{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">Mekty &lt;noreply@ваш-домен.kz&gt;</code>)
              {!telegramConfigured ? "; " : "."}
            </>
          )}
          {!telegramConfigured && (
            <>
              <code className="rounded bg-muted px-1 py-0.5 font-mono">TELEGRAM_BOT_TOKEN</code> и{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">TELEGRAM_ADMIN_CHAT_ID</code>.
            </>
          )}
        </p>
      )}
    </div>
  );
}
