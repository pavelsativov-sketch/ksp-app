"use client";

import { useState, useTransition } from "react";
import { MessageCircle, Reply, Trash2, Send, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimeAgo } from "@/components/ksp/time-ago";
import { useUiLocale } from "@/components/i18n/use-ui-locale";

interface Author {
  name: string;
  email: string;
}

interface Comment {
  id: string;
  plan_id: string;
  user_id: string;
  text: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  author: Author;
}

interface Props {
  planId: string;
  initialComments: Comment[];
  isOwner: boolean;
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-rose-500",
];

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function Avatar({ name, userId, size = "md" }: { name: string; userId: string; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "size-7 text-xs" : "size-9 text-sm";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${sizeClass} ${avatarColor(userId)}`}>
      {getInitial(name)}
    </span>
  );
}

// `isOwner` остаётся в Props: его передают вызывающие, и он нужен им для
// своих проверок. Внутри компонента он не используется — права на удаление
// проверяются на сервере.
export function CommentsSection({ planId, initialComments }: Props) {
  const { locale } = useUiLocale();
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const topLevel = comments.filter((c) => !c.parent_id);
  const replies = (parentId: string) => comments.filter((c) => c.parent_id === parentId);

  function displayName(comment: Comment): string {
    return comment.author?.name || (locale === "kk" ? "Пайдаланушы" : "Пользователь");
  }

  async function submitComment() {
    if (!text.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId, text: text.trim() }),
        });
        const data = (await res.json()) as { comment?: Comment; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Ошибка");
        if (data.comment) setComments((prev) => [...prev, data.comment!]);
        setText("");
      } catch (e) {
        setError(e instanceof Error ? e.message : locale === "kk" ? "Қате" : "Ошибка");
      }
    });
  }

  async function submitReply(parentId: string) {
    if (!replyText.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId, text: replyText.trim(), parentId }),
        });
        const data = (await res.json()) as { comment?: Comment; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Ошибка");
        if (data.comment) setComments((prev) => [...prev, data.comment!]);
        setReplyText("");
        setReplyTo(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : locale === "kk" ? "Қате" : "Ошибка");
      }
    });
  }

  async function handleDelete(commentId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/comments?commentId=${commentId}`, { method: "DELETE" });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Ошибка");
        setComments((prev) => prev.filter((c) => c.id !== commentId && c.parent_id !== commentId));
      } catch (e) {
        setError(e instanceof Error ? e.message : locale === "kk" ? "Қате" : "Ошибка");
      }
    });
  }

  // Кнопка удаления показывается всегда: проверка прав — на сервере, и клиент
// без этого не знает, чей комментарий. Раньше аргумент принимался, но не
// использовался, что сбивало с толку при чтении.
function canDelete(): boolean {
  return true;
}

  return (
    <section className="no-print space-y-4">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-left"
        aria-expanded={!collapsed}
      >
        <span className="flex items-center gap-2 font-bold">
          <MessageCircle className="size-5" />
          {locale === "kk" ? "Пікірлер" : "Комментарии"}
          <span className="text-sm font-normal text-muted-foreground">({comments.length})</span>
        </span>
        {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
      </button>

      {!collapsed && (
        <div className="space-y-4">
          {/* Форма добавления */}
          <div className="space-y-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={locale === "kk" ? "Пікіріңізді жазыңыз…" : "Напишите комментарий…"}
              maxLength={2000}
              rows={3}
              className="w-full rounded-md border border-border p-3 text-sm"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={submitComment} disabled={pending || !text.trim()}>
                <Send className="size-4" />
                {pending
                  ? locale === "kk" ? "Жіберілуде…" : "Отправка…"
                  : locale === "kk" ? "Жіберу" : "Отправить"}
              </Button>
              {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            </div>
          </div>

          {/* Список комментариев */}
          {topLevel.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {locale === "kk" ? "Әзір пікір жоқ. Алғашқы пікірді қалдырыңыз!" : "Пока нет комментариев. Оставьте первый!"}
            </p>
          ) : (
            <div className="space-y-3">
              {topLevel.map((comment) => (
                <div key={comment.id} className="space-y-2">
                  <CommentItem
                    comment={comment}
                    locale={locale}
                    displayName={displayName}
                    onReply={() => setReplyTo(comment.id)}
                    onDelete={() => handleDelete(comment.id)}
                    canDelete={canDelete()}
                  />
                  {/* Ответы */}
                  {replies(comment.id).map((reply) => (
                    <div key={reply.id} className="ml-10 space-y-2">
                      <CommentItem
                        comment={reply}
                        locale={locale}
                        displayName={displayName}
                        onReply={() => setReplyTo(reply.id)}
                        onDelete={() => handleDelete(reply.id)}
                        canDelete={canDelete()}
                        isReply
                      />
                    </div>
                  ))}
                  {/* Форма ответа */}
                  {replyTo === comment.id && (
                    <div className="ml-10 space-y-2">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={locale === "kk" ? "Жауап жазыңыз…" : "Напишите ответ…"}
                        maxLength={2000}
                        rows={2}
                        className="w-full rounded-md border border-border p-2 text-sm"
                      />
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={() => submitReply(comment.id)} disabled={pending || !replyText.trim()}>
                          <Reply className="size-4" />
                          {locale === "kk" ? "Жауап" : "Ответить"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setReplyTo(null); setReplyText(""); }}>
                          {locale === "kk" ? "Болдырмау" : "Отмена"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CommentItem({
  comment,
  locale,
  displayName,
  onReply,
  onDelete,
  canDelete,
  isReply = false,
}: {
  comment: Comment;
  locale: string;
  displayName: (c: Comment) => string;
  onReply: () => void;
  onDelete: () => void;
  canDelete: boolean;
  isReply?: boolean;
}) {
  return (
    <div className={`rounded-lg border border-border bg-surface p-3 ${isReply ? "ml-4" : ""}`}>
      <div className="flex items-start gap-3">
        <Avatar name={displayName(comment)} userId={comment.user_id} size={isReply ? "sm" : "md"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">{displayName(comment)}</span>
            <span className="text-xs text-muted-foreground"><TimeAgo iso={comment.created_at} locale={locale} /></span>
          </div>
          <p className="mt-1 text-sm whitespace-pre-wrap">{comment.text}</p>
          <div className="mt-2 flex items-center gap-3">
            {!isReply && (
              <button
                type="button"
                onClick={onReply}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              >
                <Reply className="size-3" />
                {locale === "kk" ? "Жауап" : "Ответить"}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-600"
              >
                <Trash2 className="size-3" />
                {locale === "kk" ? "Жою" : "Удалить"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
