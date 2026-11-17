import type { MaterialKind, StageKey } from "@/lib/types/ksp";

/** Материал сохранён в урок кнопкой на странице: панель комплекта предлагает подключить его к этапу. */
export const MATERIAL_SAVED_EVENT = "kit:material-saved";

export function announceMaterialSaved() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MATERIAL_SAVED_EVENT));
}

/** Сохранённый на сервере материал урока; null — ещё не создан или нет доступа. */
export async function fetchPlanMaterial<T>(planId: string, kind: MaterialKind): Promise<T | null> {
  if (!/^[0-9a-f]{24}$/i.test(planId)) return null;
  try {
    const res = await fetch(`/api/plans/${planId}/materials/${kind}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { payload?: T };
    return data.payload ?? null;
  } catch {
    // Сеть недоступна: кнопка просто не предложит открыть прошлый материал.
    return null;
  }
}

/** Сохраняет обновлённый материал урока на сервере (например, черновик презентации). */
export async function savePlanMaterialClient(
  planId: string,
  kind: MaterialKind,
  input: { title: string; stage?: StageKey; payload: unknown },
): Promise<boolean> {
  if (!/^[0-9a-f]{24}$/i.test(planId)) return false;
  try {
    const res = await fetch(`/api/plans/${planId}/materials/${kind}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.ok) announceMaterialSaved();
    return res.ok;
  } catch {
    return false;
  }
}
