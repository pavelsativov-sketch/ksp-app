import type { MaterialKind } from "@/lib/types/ksp";

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
