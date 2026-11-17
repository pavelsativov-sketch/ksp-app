// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useFormDraft } from "@/lib/use-form-draft";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const KEY = "draft:test";

describe("useFormDraft", () => {
  it("восстанавливает сохранённый черновик при монтировании", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ title: "Старый" }));
    const restore = vi.fn();
    renderHook(() => useFormDraft(KEY, { title: "" }, false, restore));
    expect(restore).toHaveBeenCalledWith({ title: "Старый" });
    // Первый пустой рендер не должен затереть черновик.
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
  });

  it("пишет черновик при изменениях и предупреждает при уходе", () => {
    const { rerender } = renderHook(
      ({ v, dirty }) => useFormDraft(KEY, v, dirty, () => {}),
      { initialProps: { v: { title: "" }, dirty: false } },
    );
    rerender({ v: { title: "Новый" }, dirty: true });
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "null")).toEqual({ title: "Новый" });

    const ev = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("clearDraft удаляет черновик и снимает предупреждение", () => {
    const { result, rerender } = renderHook(
      ({ v, dirty }) => useFormDraft(KEY, v, dirty, () => {}),
      { initialProps: { v: { title: "" }, dirty: false } },
    );
    rerender({ v: { title: "Новый" }, dirty: true });
    result.current();
    expect(window.localStorage.getItem(KEY)).toBeNull();

    const ev = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});
