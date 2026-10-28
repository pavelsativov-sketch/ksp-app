"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deletePlanAction } from "@/app/actions/plans";

/**
 * Кнопка удаления плана с подтверждением. Удаление мягкое (корзина),
 * поэтому подтверждение объясняет, что план можно вернуть из дашборда.
 */
export function DeletePlanButton({ planId, label = "Удалить" }: { planId: string; label?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (!window.confirm("Удалить план? Его можно будет восстановить из корзины на дашборде.")) return;
    setPending(true);
    setError(null);
    try {
      const res = await deletePlanAction(planId);
      if (res && "error" in res) {
        setError(res.error);
        setPending(false);
      }
    } catch {
      setError("Не удалось удалить план");
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant="destructive" size="sm" onClick={onDelete} disabled={pending}>
        <Trash2 className="w-4 h-4" />
        {pending ? "…" : label}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
