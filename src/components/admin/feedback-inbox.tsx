"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Crown,
  KeyRound,
  Loader2,
  MessageSquareReply,
  Search,
  Star,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createAdminCodeAction,
  createPasswordResetLinkAction,
  grantProAction,
} from "@/app/actions/admin";
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
  purchase_pro: "💳 Покупка Pro",
  school_lead: "🏫 Заявка школы",
  password_reset: "🔑 Сброс пароля",
  bug: "🐛 Ошибка",
  feature: "💡 Идея",
  general: "💬 Обращение",
};

const CATEGORY_BADGE_STYLE: Record<FeedbackCategory, string> = {
  purchase_pro: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
  school_lead: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30",
  password_reset: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30",
  bug: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30",
  feature: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30",
  general: "bg-muted text-foreground border border-border",
};

function formatKzDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      timeZone: "Asia/Almaty",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function FeedbackInbox({ initialItems }: { initialItems: AdminFeedbackRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState<AdminFeedbackRow[]>(initialItems);
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<FeedbackCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replyOpenId, setReplyOpenId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetLinks, setResetLinks] = useState<Record<string, string>>({});
  const [issuedCodes, setIssuedCodes] = useState<Record<string, string>>({});
  const [proGrants, setProGrants] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (!q) return true;
      const hay = [
        item.userEmail,
        item.contactName,
        item.contactInfo,
        item.organization,
        item.comment,
        item.response,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, statusFilter, categoryFilter, search]);

  function copyWithFeedback(key: string, text: string) {
    void navigator.clipboard.writeText(text).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2200);
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
          it.id === id ? { ...it, response: replyText.trim(), status: "resolved" } : it,
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

  async function generateResetForItem(item: AdminFeedbackRow) {
    const email = item.userEmail || (item.contactInfo?.includes("@") ? item.contactInfo.trim() : null);
    if (!email) return;
    setBusyId(item.id);
    setError(null);
    try {
      const res = await createPasswordResetLinkAction({ email });
      if (!res.ok) throw new Error(res.error);
      setResetLinks((prev) => ({ ...prev, [item.id]: res.resetUrl }));
      copyWithFeedback(`reset:${item.id}`, res.resetUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать ссылку сброса");
    } finally {
      setBusyId(null);
    }
  }

  async function quickIssueCode(item: AdminFeedbackRow, type: "pro_1m" | "pro_3m" | "pro_1y") {
    setBusyId(item.id);
    setError(null);
    try {
      const res = await createAdminCodeAction({ type });
      if (!res.ok) throw new Error(res.error);
      setIssuedCodes((prev) => ({ ...prev, [item.id]: res.plaintext }));
      copyWithFeedback(`code:${item.id}`, res.plaintext);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать промокод");
    } finally {
      setBusyId(null);
    }
  }

  async function quickGrantPro(item: AdminFeedbackRow, type: "pro_1m" | "pro_3m" | "pro_1y") {
    const email = item.userEmail || (item.contactInfo?.includes("@") ? item.contactInfo.trim() : null);
    if (!email) return;
    setBusyId(item.id);
    setError(null);
    try {
      const res = await grantProAction({ email, type });
      if (!res.ok) throw new Error(res.error);
      const until = new Date(res.expiresAt).toLocaleDateString("ru-RU");
      setProGrants((prev) => ({ ...prev, [item.id]: `Pro активирован для ${res.email} до ${until}` }));
      await changeStatus(item.id, "resolved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выдать Pro по email");
      setBusyId(null);
    }
  }

  const countByStatus = (st: FeedbackStatus) => items.filter((i) => i.status === st).length;
  const countByCat = (cat: FeedbackCategory) => items.filter((i) => i.category === cat).length;

  return (
    <div className="space-y-4">
      {/* Поиск + фильтры по статусу и категории */}
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по телефону, WhatsApp, email, школе или тексту заявки…"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(["all", "new", "in_progress", "resolved", "closed"] as const).map((st) => {
              const count = st === "all" ? items.length : countByStatus(st);
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    statusFilter === st
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {st === "all" ? `Все (${count})` : `${STATUS_LABEL[st]} (${count})`}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Категория:</span>
          {(
            [
              "all",
              "purchase_pro",
              "school_lead",
              "password_reset",
              "bug",
              "feature",
              "general",
            ] as const
          ).map((cat) => {
            const count = cat === "all" ? items.length : countByCat(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  categoryFilter === cat
                    ? "bg-foreground text-background"
                    : "bg-muted/70 text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat === "all" ? "Все типы" : `${CATEGORY_LABEL[cat]} (${count})`}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Обращений и заявок по выбранному фильтру нет.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => {
            const candidateEmail =
              item.userEmail || (item.contactInfo?.includes("@") ? item.contactInfo.trim() : null);

            return (
              <div
                key={item.id}
                className={`space-y-3 rounded-2xl border bg-surface p-4 text-sm transition-colors ${
                  item.status === "new" ? "border-amber-500/40 shadow-sm" : "border-border"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-md px-2.5 py-0.5 font-semibold ${CATEGORY_BADGE_STYLE[item.category]}`}>
                      {CATEGORY_LABEL[item.category] ?? item.category}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 font-semibold ${
                        item.status === "new"
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          : item.status === "resolved"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABEL[item.status]}
                    </span>
                    {item.category !== "purchase_pro" &&
                      item.category !== "school_lead" &&
                      item.category !== "password_reset" && (
                        <span className="inline-flex items-center gap-0.5 text-amber-500">
                          <Star className="size-3.5 fill-current" /> {item.rating}/5
                        </span>
                      )}
                    <span className="font-medium text-foreground">
                      {item.contactName || item.userEmail || item.userId}
                    </span>
                    {item.contactInfo && (
                      <button
                        type="button"
                        onClick={() => copyWithFeedback(`contact:${item.id}`, item.contactInfo!)}
                        className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-xs hover:bg-primary/10"
                        title="Нажмите, чтобы скопировать контакт"
                      >
                        {copiedKey === `contact:${item.id}` ? (
                          <Check className="size-3 text-emerald-600" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                        {item.contactInfo}
                      </button>
                    )}
                    {item.organization && (
                      <span className="rounded bg-primary/10 px-2 py-0.5 font-medium text-primary">
                        {item.organization}
                      </span>
                    )}
                    <span className="text-muted-foreground">{formatKzDate(item.createdAt)}</span>
                  </div>

                  {/* Быстрые действия прямо из карточки */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {candidateEmail && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === item.id}
                        onClick={() => void quickGrantPro(item, "pro_1m")}
                        title={`Начислить Pro на 1 месяц для ${candidateEmail}`}
                      >
                        <Crown className="size-3.5 text-amber-500" />
                        Pro +1 мес
                      </Button>
                    )}

                    {(item.category === "purchase_pro" || item.category === "school_lead") && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === item.id}
                        onClick={() => void quickIssueCode(item, "pro_1m")}
                        title="Создать и скопировать новый промокод Pro на 1 месяц"
                      >
                        <Ticket className="size-3.5 text-primary" />
                        Код Pro (1м)
                      </Button>
                    )}

                    {candidateEmail && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === item.id}
                        onClick={() => void generateResetForItem(item)}
                      >
                        {copiedKey === `reset:${item.id}` ? (
                          <Check className="size-3.5 text-emerald-600" />
                        ) : (
                          <KeyRound className="size-3.5" />
                        )}
                        {copiedKey === `reset:${item.id}` ? "Скопировано" : "Сброс пароля"}
                      </Button>
                    )}

                    <select
                      value={item.status}
                      disabled={busyId === item.id}
                      onChange={(e) => void changeStatus(item.id, e.target.value as FeedbackStatus)}
                      aria-label="Статус обращения"
                      className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium"
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

                <p className="whitespace-pre-wrap rounded-xl bg-muted/40 p-3 leading-relaxed">
                  {item.comment}
                </p>

                {proGrants[item.id] && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    ✓ {proGrants[item.id]}
                  </div>
                )}

                {issuedCodes[item.id] && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-2.5 text-xs">
                    <span className="font-semibold">Выпущен промокод Pro (1 мес):</span>
                    <code className="flex-1 rounded bg-background px-2 py-1 font-mono font-bold">
                      {issuedCodes[item.id]}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => copyWithFeedback(`code:${item.id}`, issuedCodes[item.id]!)}
                    >
                      {copiedKey === `code:${item.id}` ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      Копировать код
                    </Button>
                  </div>
                )}

                {resetLinks[item.id] && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs">
                    <span className="font-semibold">Одноразовая ссылка сброса (2 ч):</span>
                    <code className="flex-1 break-all font-mono">{resetLinks[item.id]}</code>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => copyWithFeedback(`reset:${item.id}`, resetLinks[item.id]!)}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                )}

                {item.response && replyOpenId !== item.id && (
                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs">
                    <strong>Заметка / ответ администратора:</strong> {item.response}
                  </div>
                )}

                {replyOpenId === item.id && (
                  <div className="space-y-2 pt-1">
                    <Textarea
                      rows={3}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Введите ответ или внутреннюю заметку по заявке…"
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
                        Сохранить и отметить «Решено»
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
