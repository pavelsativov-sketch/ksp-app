"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Loader2, MessageSquareReply, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createPasswordResetLinkAction } from "@/app/actions/admin";
import type { FeedbackCategory, FeedbackStatus } from "@/lib/feedback";

export interface AdminFeedbackRow {
  id: string;
  userId: string;
  userEmail: string | null;
  contactName?: string | null;
  contactInfo?: string | null;
  organization?: string | null;
  rating: number;
  comment: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  response?: string;
  createdAt: string;
}

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "Новое",
  in_progress: "В работе",
  resolved: "Решено",
  closed: "Закрыто",
};

const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  bug: "Ошибка",
  feature: "Идея / Улучшение",
  general: "Обращение",
  purchase_pro: "Покупка Pro",
  school_lead: "Заявка школы",
  password_reset: "Сброс пароля",
};

export function FeedbackInbox({ initialItems }: { initialItems: AdminFeedbackRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState<AdminFeedbackRow[]>(initialItems);
  const [filter, setFilter] = useState<FeedbackStatus | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replyOpenId, setReplyOpenId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetLinks, setResetLinks] = useState<Record<string, string>>({});
  const [copiedResetId, setCopiedResetId] = useState<string | null>(null);

  const visible = items.filter((item) => filter === "all" || item.status === filter);

  async function generateResetForItem(item: AdminFeedbackRow) {
    const email = item.userEmail || (item.contactInfo?.includes("@") ? item.contactInfo : null);
    if (!email) return;
    setBusyId(item.id);
    setError(null);
    try {
      const res = await createPasswordResetLinkAction({ email });
      if (!res.ok) throw new Error(res.error);
      setResetLinks((prev) => ({ ...prev, [item.id]: res.resetUrl }));
      await navigator.clipboard.writeText(res.resetUrl).catch(() => {});
      setCopiedResetId(item.id);
      setTimeout(() => setCopiedResetId(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать ссылку сброса");
    } finally {
      setBusyId(null);
    }
  }

  async function changeStatus(id: string, status: FeedbackStatus) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/feedback?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Не удалось изменить статус обращения");
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status } : it)));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusyId(null);
    }
  }

  async function sendReply(id: string) {
    if (!replyText.trim()) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/feedback?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: replyText.trim() }),
      });
      if (!res.ok) throw new Error("Не удалось сохранить ответ");
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? { ...it, response: replyText.trim(), status: "resolved" }
            : it,
        ),
      );
      setReplyOpenId(null);
      setReplyText("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "new", "in_progress", "resolved", "closed"] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setFilter(st)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === st
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {st === "all" ? `Все (${items.length})` : STATUS_LABEL[st]}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Обращений по выбранному фильтру нет.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => (
            <div key={item.id} className="space-y-2.5 rounded-xl border border-border p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-muted px-2 py-0.5 font-semibold">
                    {CATEGORY_LABEL[item.category] ?? item.category}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 font-semibold ${
                      item.status === "new"
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : item.status === "resolved"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {STATUS_LABEL[item.status]}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-amber-500">
                    <Star className="size-3.5 fill-current" /> {item.rating}/5
                  </span>
                  <span className="text-muted-foreground">
                    {item.userEmail ?? item.contactName ?? item.userId}
                    {item.contactInfo ? ` (${item.contactInfo})` : ""}
                    {item.organization ? ` · ${item.organization}` : ""} ·{" "}
                    {new Date(item.createdAt).toLocaleString("ru-RU", { timeZone: "UTC" })}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {(item.userEmail || item.contactInfo?.includes("@")) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === item.id}
                      onClick={() => void generateResetForItem(item)}
                    >
                      {copiedResetId === item.id ? (
                        <Check className="size-3.5 text-emerald-600" />
                      ) : (
                        <KeyRound className="size-3.5" />
                      )}
                      {copiedResetId === item.id ? "Ссылка скопирована" : "Ссылка сброса"}
                    </Button>
                  )}
                  <select
                    value={item.status}
                    disabled={busyId === item.id}
                    onChange={(e) => void changeStatus(item.id, e.target.value as FeedbackStatus)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="new">Новое</option>
                    <option value="in_progress">В работе</option>
                    <option value="resolved">Решено</option>
                    <option value="closed">Закрыто</option>
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReplyOpenId(replyOpenId === item.id ? null : item.id);
                      setReplyText(item.response ?? "");
                    }}
                  >
                    <MessageSquareReply className="size-3.5" />
                    {item.response ? "Изменить ответ" : "Ответить"}
                  </Button>
                </div>
              </div>

              <p className="whitespace-pre-wrap leading-relaxed">{item.comment}</p>

              {resetLinks[item.id] && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs">
                  <span className="font-semibold">Одноразовая ссылка сброса (2 ч):</span>
                  <code className="flex-1 break-all font-mono">{resetLinks[item.id]}</code>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard.writeText(resetLinks[item.id]!);
                      setCopiedResetId(item.id);
                      setTimeout(() => setCopiedResetId(null), 2000);
                    }}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              )}

              {item.response && replyOpenId !== item.id && (
                <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs">
                  <strong>Ответ администратора:</strong> {item.response}
                </div>
              )}

              {replyOpenId === item.id && (
                <div className="space-y-2 pt-1">
                  <Textarea
                    rows={3}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Введите ответ пользователю / представителю школы…"
                    className="text-xs"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setReplyOpenId(null)}
                    >
                      Отмена
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyId === item.id || !replyText.trim()}
                      onClick={() => void sendReply(item.id)}
                    >
                      {busyId === item.id && <Loader2 className="size-3.5 animate-spin" />}
                      Сохранить ответ
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
