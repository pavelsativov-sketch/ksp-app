"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  hidePlanAction,
  resolveReportAction,
  unhidePlanAction,
  type ModerationQueue,
} from "@/app/actions/admin";
import type { HiddenPlanItem } from "@/lib/moderation";
import { Button } from "@/components/ui/button";

async function run(
  action: () => Promise<{ ok: true } | { ok: false; error: string; status: number }>,
  router: ReturnType<typeof useRouter>,
  setError: (v: string) => void,
  setPending: (v: boolean) => void,
  busy: React.MutableRefObject<boolean>,
) {
  if (busy.current) return;
  busy.current = true;
  setPending(true);
  setError("");
  try {
    const result = await action();
    if (result.ok) router.refresh();
    else setError(result.error);
  } catch {
    setError("Ответ не получен. Обновите страницу.");
  } finally {
    busy.current = false;
    setPending(false);
  }
}

function ActionButton({
  label,
  confirm,
  action,
}: {
  label: string;
  confirm?: string;
  action: () => Promise<{ ok: true } | { ok: false; error: string; status: number }>;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (!asking) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => (confirm ? setAsking(true) : run(action, router, setError, setPending, busy))}
      >
        {label}
      </Button>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs">{confirm}</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => run(action, router, setError, setPending, busy)}
        >
          {pending ? "…" : "Подтвердить"}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setAsking(false)}>
          Отмена
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Очередь жалоб: скрыть/вернуть план, закрыть жалобу. */
export function ModerationQueue({ items }: { items: ModerationQueue }) {
  const date = (v: string | null) =>
    v ? new Date(v).toLocaleString("ru-RU", { timeZone: "UTC" }) : "—";
  if (!items.length) return <p className="text-sm text-muted-foreground">Открытых жалоб нет.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {["План", "Жалоба", "Автор жалобы", "Дата", "Действия"].map((t) => (
              <th key={t} className="p-3">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border last:border-0">
              <td className="p-3">
                <Link
                  href={`/plans/${item.planId}`}
                  prefetch={false}
                  className="font-medium underline"
                >
                  {item.planTitle}
                </Link>
                <p className="text-xs tabular-nums text-muted-foreground">{item.planId}</p>
                {item.hidden ? (
                  <p className="text-xs font-medium text-warning">Скрыт</p>
                ) : (
                  item.openCount > 1 && (
                    <p className="text-xs text-muted-foreground">Жалоб: {item.openCount}</p>
                  )
                )}
              </td>
              <td className="p-3">
                <p>{item.reason}</p>
                {item.details && <p className="text-xs text-muted-foreground">{item.details}</p>}
              </td>
              <td className="p-3 text-xs tabular-nums">{item.reporterEmail ?? "—"}</td>
              <td className="p-3">{date(item.createdAt)}</td>
              <td className="p-3">
                <div className="flex flex-wrap gap-2">
                  {item.hidden ? (
                    <ActionButton
                      label="Вернуть"
                      action={() => unhidePlanAction({ planId: item.planId })}
                    />
                  ) : (
                    <ActionButton
                      label="Скрыть"
                      confirm="Скрыть план из библиотеки и по ссылкам?"
                      action={() => hidePlanAction({ planId: item.planId })}
                    />
                  )}
                  <ActionButton
                    label="Закрыть жалобу"
                    action={() => resolveReportAction({ id: item.id })}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Список скрытых планов — позволяет снять скрытие даже после закрытия жалобы. */
export function HiddenPlansList({ items }: { items: HiddenPlanItem[] }) {
  if (!items.length) return null;
  const date = (v: string | null) =>
    v ? new Date(v).toLocaleString("ru-RU", { timeZone: "UTC" }) : "—";

  return (
    <div className="space-y-2 pt-3">
      <h3 className="text-sm font-semibold">Скрытые планы ({items.length})</h3>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="p-3">План</th>
              <th className="p-3">Владелец ID</th>
              <th className="p-3">Скрыт (UTC)</th>
              <th className="p-3">Действие</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.planId} className="border-b border-border last:border-0">
                <td className="p-3">
                  <Link href={`/plans/${p.planId}`} prefetch={false} className="font-medium underline">
                    {p.title}
                  </Link>
                  <p className="text-xs tabular-nums text-muted-foreground">{p.planId}</p>
                </td>
                <td className="p-3 text-xs tabular-nums text-muted-foreground">{p.ownerId || "—"}</td>
                <td className="p-3 text-xs">{date(p.hiddenAt)}</td>
                <td className="p-3">
                  <ActionButton
                    label="Вернуть в библиотеку"
                    action={() => unhidePlanAction({ planId: p.planId })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
