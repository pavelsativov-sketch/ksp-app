"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Черновик формы в localStorage + предупреждение при уходе со страницы.
 * Возвращает clearDraft — вызвать после успешного сохранения.
 */
export function useFormDraft<T>(
  key: string,
  value: T,
  isDirty: boolean,
  restore: (draft: T) => void,
): () => void {
  const restoreRef = useRef(restore);
  const savedRef = useRef(false);
  const skipFirstWriteRef = useRef(true);

  useEffect(() => {
    restoreRef.current = restore;
  }, [restore]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) restoreRef.current(JSON.parse(raw) as T);
    } catch {
      // Битый черновик или закрытое хранилище — просто начинаем с пустой формы.
    }
  }, [key]);

  useEffect(() => {
    // Первый проход — исходные пустые значения; не затираем черновик до его восстановления.
    if (skipFirstWriteRef.current) {
      skipFirstWriteRef.current = false;
      return;
    }
    if (savedRef.current) return;
    try {
      if (isDirty) window.localStorage.setItem(key, JSON.stringify(value));
      else window.localStorage.removeItem(key);
    } catch {
      // Переполненное или запрещённое хранилище не должно ломать форму.
    }
  }, [key, value, isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (savedRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  return useCallback(() => {
    savedRef.current = true;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Нечего чистить — хранилище недоступно.
    }
  }, [key]);
}
