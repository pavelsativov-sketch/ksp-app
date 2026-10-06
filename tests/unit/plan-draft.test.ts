// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlanDraft, type DraftState } from "@/components/ksp/hooks/use-plan-draft";
import { emptyKsp } from "@/lib/types/ksp";

function initialState(): DraftState {
  return {
    title: "Lesson", subjectId: "math", grade: 5, quarter: null, classId: "",
    section: "", visibility: "private", language: "ru", content: emptyKsp(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("plan draft persistence", () => {
  it("persists a returned server ID with the new draft and restores it on remount", () => {
    const first = renderHook(() => usePlanDraft(undefined, initialState()));
    act(() => vi.advanceTimersByTime(0));
    act(() => first.result.current.setState(prev => ({ ...prev, id: "507f1f77bcf86cd799439011" })));
    act(() => vi.advanceTimersByTime(600));
    first.unmount();
    const second = renderHook(() => usePlanDraft(undefined, initialState()));
    act(() => vi.advanceTimersByTime(0));
    expect(second.result.current.state.id).toBe("507f1f77bcf86cd799439011");
  });

  it("restores the draft profile instead of retaining the initial profile", () => {
    const saved = initialState();
    saved.content.schoolProfile = "ogn";
    window.localStorage.setItem("ksp-draft:new", JSON.stringify(saved));
    const initial = initialState();
    initial.content.schoolProfile = "emn";
    const { result } = renderHook(() => usePlanDraft(undefined, initial));
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.state.content.schoolProfile).toBe("ogn");
  });

  it("retains the server plan ID when restoring a legacy draft without an ID", () => {
    window.localStorage.setItem("ksp-draft:existing", JSON.stringify(initialState()));
    const { result } = renderHook(() => usePlanDraft("existing", { ...initialState(), id: "existing" }));
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.state.id).toBe("existing");
  });
});
