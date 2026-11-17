"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, CreditCard, KeyRound, Loader2, School } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type LeadKind = "purchase_pro" | "school_lead";

export function PricingLeadButton({
  kind,
  label,
  className,
}: {
  kind: LeadKind;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [organization, setOrganization] = useState("");
  const [planPeriod, setPlanPeriod] = useState<"month" | "quarter" | "year">("month");
  const [teachersCount, setTeachersCount] = useState("15");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const isPro = kind === "purchase_pro";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name: name.trim(),
          contact: contact.trim(),
          organization: organization.trim() || undefined,
          planPeriod: isPro ? planPeriod : undefined,
          teachersCount: !isPro && Number(teachersCount) > 0 ? Number(teachersCount) : undefined,
          message: message.trim() || undefined,
          website,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Не удалось отправить заявку");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка отправки");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSubmitted(false);
          setError(null);
          setOpen(true);
        }}
        className={className}
      >
        {isPro ? <CreditCard aria-hidden="true" className="size-4" /> : <School aria-hidden="true" className="size-4" />}
        {label}
        {!isPro && <ArrowRight aria-hidden="true" className="size-4" />}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-2xl border border-border bg-surface p-6">
          <DialogTitle className="editorial-display text-2xl">
            {isPro ? "Подключить Учитель Pro (Kaspi / счёт)" : "Заявка на подключение школы"}
          </DialogTitle>

          {submitted ? (
            <div className="mt-4 space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                <div className="space-y-1">
                  <p className="font-semibold">Заявка принята!</p>
                  <p className="text-muted-foreground">
                    {isPro
                      ? "Мы свяжемся с вами по указанному контакту (WhatsApp / email), отправим ссылку на оплату Kaspi и персональный код активации Pro."
                      : "Менеджер по работе со школами свяжется с вами для демонстрации платформы и расчёта стоимости на педколлектив."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                {isPro && (
                  <Link
                    href="/redeem"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline"
                  >
                    <KeyRound className="size-4" /> У меня уже есть код
                  </Link>
                )}
                <Button type="button" onClick={() => setOpen(false)} className="ml-auto">
                  Готово
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-sm">
              <input
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
              />

              {isPro && (
                <div className="grid gap-1.5">
                  <label htmlFor="lead-period" className="font-medium">
                    Период подписки
                  </label>
                  <select
                    id="lead-period"
                    value={planPeriod}
                    onChange={(e) => setPlanPeriod(e.target.value as "month" | "quarter" | "year")}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="month">1 месяц — 2 490 ₸</option>
                    <option value="quarter">Четверть (3 месяца) — 5 990 ₸</option>
                    <option value="year">Учебный год — 19 900 ₸ (выгодно)</option>
                  </select>
                </div>
              )}

              <div className="grid gap-1.5">
                <label htmlFor="lead-name" className="font-medium">
                  {isPro ? "Ваше ФИО" : "ФИО директора / завуча"}
                </label>
                <Input
                  id="lead-name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Айгуль Сериковна"
                />
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="lead-contact" className="font-medium">
                  WhatsApp / телефон или Email для получения кода
                </label>
                <Input
                  id="lead-contact"
                  required
                  minLength={5}
                  maxLength={160}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="+7 777 000 00 00 или teacher@school.kz"
                />
              </div>

              {!isPro && (
                <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                  <div className="grid gap-1.5">
                    <label htmlFor="lead-org" className="font-medium">
                      Школа и город / район
                    </label>
                    <Input
                      id="lead-org"
                      required
                      maxLength={200}
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      placeholder="Школа-гимназия №15, Алматы"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label htmlFor="lead-teachers" className="font-medium">
                      Педагогов
                    </label>
                    <Input
                      id="lead-teachers"
                      type="number"
                      min={1}
                      max={2000}
                      value={teachersCount}
                      onChange={(e) => setTeachersCount(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-1.5">
                <label htmlFor="lead-msg" className="font-medium">
                  Комментарий (необязательно)
                </label>
                <Textarea
                  id="lead-msg"
                  rows={2}
                  maxLength={1000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    isPro
                      ? "Например: нужен счёт Kaspi Pay на этот номер"
                      : "Удобное время для звонка или вопросы по договору"
                  }
                />
              </div>

              {error && (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                  Отмена
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  {isPro ? "Запросить счёт Kaspi / код" : "Отправить заявку"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PublicSupportForm() {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [organization, setOrganization] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        <div>
          <p className="font-semibold">Сообщение отправлено!</p>
          <p className="mt-1 text-muted-foreground">
            Мы получили ваше обращение и ответим по указанному контакту в течение рабочего дня.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-4 text-left text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending) return;
        setPending(true);
        setError(null);
        try {
          const res = await fetch("/api/leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "support",
              name: name.trim(),
              contact: contact.trim(),
              organization: organization.trim() || undefined,
              message: message.trim(),
              website,
            }),
          });
          const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
          if (!res.ok || !data?.ok) throw new Error(data?.error || "Не удалось отправить обращение");
          setDone(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Ошибка отправки");
        } finally {
          setPending(false);
        }
      }}
    >
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor="pub-name" className="font-medium">
            Ваше имя
          </label>
          <Input
            id="pub-name"
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Имя и фамилия"
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="pub-contact" className="font-medium">
            Email или WhatsApp для ответа
          </label>
          <Input
            id="pub-contact"
            required
            minLength={5}
            maxLength={160}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="teacher@school.kz или +7 777…"
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="pub-org" className="font-medium">
          Школа / город (необязательно)
        </label>
        <Input
          id="pub-org"
          maxLength={200}
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          placeholder="Например: СШ №24, Астана"
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="pub-msg" className="font-medium">
          Вопрос, заявка школы или помощь со входом
        </label>
        <Textarea
          id="pub-msg"
          required
          minLength={5}
          maxLength={3000}
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Опишите ваш вопрос или оставьте заявку на подключение…"
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Отправить сообщение
      </Button>
    </form>
  );
}
