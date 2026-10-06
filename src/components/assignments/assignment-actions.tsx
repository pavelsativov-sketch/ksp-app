"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, RotateCcw, XOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiLocale } from "@/components/i18n/use-ui-locale";

/** Действия с выдачей: повтор (новый код), закрыть, скопировать ссылку. */
export function AssignmentActions({ id, code, status }: { id: string; code: string; status: "open" | "closed" }) {
  const { t } = useUiLocale();
  const a = t.assignments;
  const router = useRouter();
  const [pending, setPending] = useState<"repeat" | "close" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function act(action: "repeat" | "close") {
    setPending(action);
    setError(null);
    try {
      const res = await fetch(`/api/assignments/${id}?action=${action}`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Не удалось выполнить действие");
      if (action === "repeat" && data?.id) router.push(`/assignments/${data.id}`);
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : a.actErr);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void navigator.clipboard.writeText(`${window.location.origin}/a/${code}`).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {a.linkBtn}
      </Button>
      <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => void act("repeat")}>
        <RotateCcw className="size-3.5" /> {pending === "repeat" ? a.repeating : a.repeatBtn}
      </Button>
      {status === "open" && (
        <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => void act("close")}>
          <XOctagon className="size-3.5" /> {pending === "close" ? a.closing : a.closeBtn}
        </Button>
      )}
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
