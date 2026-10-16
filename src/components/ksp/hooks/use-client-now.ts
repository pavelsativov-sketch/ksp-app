"use client";

import { useSyncExternalStore } from "react";

/**
 * «Сейчас» по часам браузера — но без ошибок гидратации.
 *
 * Относительное время и «сегодняшняя дата» нельзя вычислять в useState и в
 * setState внутри эффекта: на сервере и в браузере они считаются в разные
 * моменты и по разным часам, и React падал с ошибкой гидратации 418.
 *
 * useSyncExternalStore решает ровно это: до гидрации отдаётся серверное
 * значение (null), а сразу после гидрации React сам перерисовывает под
 * клиентское «сейчас» — без setState и без расхождения разметки.
 */

const TICK_MS = 30_000;

interface NowStore {
  subscribe(onChange: () => void): () => void;
  /** Круглые 30 секунд: внутри окна снимок не меняется, лишних рендеров нет. */
  getSnapshot(): number;
}

const nowStore: NowStore = {
  subscribe(onChange) {
    const timer = setInterval(onChange, TICK_MS);
    return () => clearInterval(timer);
  },
  getSnapshot() {
    return Math.floor(Date.now() / TICK_MS);
  },
};

const SERVER_NOW = null;

/**
 * Клиентское «сейчас»: null на сервере и при первом (гидрационном) рендере,
 * число миллисекунд после гидрации. Дальше отрисовка решает сама, что
 * показывать, пока значения нет.
 */
export function useClientNow(): number | null {
  const tick = useSyncExternalStore(
    nowStore.subscribe,
    nowStore.getSnapshot,
    () => SERVER_NOW,
  );
  if (tick === SERVER_NOW) return null;
  // Устойчивый снимок, а не Date.now(): на этот раз — начало текущего
  // 30-секундного окна. Погрешность «мин назад» не видна глазу, зато
  // рендер остаётся чистым и не ловит случайные перерисовки.
  return tick * TICK_MS;
}
