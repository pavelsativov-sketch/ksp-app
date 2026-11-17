import type { MaterialKind } from "@/lib/types/ksp";

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
