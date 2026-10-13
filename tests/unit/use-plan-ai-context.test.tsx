// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePlanAi } from "@/components/ksp/hooks/use-plan-ai";

function responseFor(rag: unknown) {
  const frame = `data: ${JSON.stringify({ type: "done", content: { topic: "Дроби" }, rag, quota: { remaining: 3 } })}\n\n`;
  return new Response(frame, { headers: { "Content-Type": "text/event-stream" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  sessionStorage.clear();
});

it("records safe metadata, supports exact in-memory replay, and omits private homework text after reload", async () => {
  const rag = {
    selected: true,
    textbookTitle: "Алгебра 5",
    chunkCount: 1,
    method: "keyword",
    status: "degraded",
    warnings: ["Applied fallback search."],
    sources: [{ id: "507f1f77bcf86cd799439001", pageNumber: 17, chunkIndex: 3 }],
  };
  const fetch = vi.fn().mockImplementation(() => responseFor(rag));
  vi.stubGlobal("fetch", fetch);
  const { result, unmount } = renderHook(() => usePlanAi({ historyKey: "history-plan" }));

  await act(async () => {
    await result.current.generateWithAi({
      grade: 5,
      subjectName: "Математика",
      topic: "Дроби",
      learningObjectives: ["5.1.2.1 — Салыстыру"],
      language: "kz",
      schoolProfile: "emn",
      section: "Рационал сандар",
      previousTopic: "Бүтін сандар",
      previousHomework: "Үй жұмысы бойынша қысқа еске салу",
      textbookId: "507f1f77bcf86cd799439099",
      planRevision: "2026-10-12T12:00:00.000Z",
    });
  });

  expect(result.current.lastRunContext).toMatchObject({
    grade: 5,
    subject: "Математика",
    topic: "Дроби",
    learningObjectives: ["5.1.2.1 — Салыстыру"],
    language: "kz",
    schoolProfile: "emn",
    section: "Рационал сандар",
    previousLessonContextIncluded: true,
    textbookSelected: true,
    rag: { status: "degraded", textbookTitle: "Алгебра 5", sources: [{ pageNumber: 17, chunkIndex: 3 }] },
  });
  expect(result.current.ragNote).toContain("Алгебра 5");
  const sent = JSON.parse(fetch.mock.calls[0][1].body as string) as Record<string, unknown>;
  expect(sent).toMatchObject({ grade: 5, subject: "Математика", topic: "Дроби", language: "kz", textbookId: "507f1f77bcf86cd799439099" });
  expect(result.current.lastRunContext?.generatedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
  expect(result.current.lastRunContext).toMatchObject({ promptVersion: "ksp-generation-v1", planRevision: "2026-10-12T12:00:00.000Z" });
  const runId = result.current.lastRunContext!.id;
  await waitFor(() => expect(sessionStorage.getItem("ksp-ai-run-history:history-plan")).not.toBeNull());
  expect(sessionStorage.getItem("ksp-ai-run-history:history-plan")).not.toContain("Үй жұмысы бойынша қысқа еске салу");
  expect(result.current.canReplayExactly(runId)).toBe(true);

  await act(async () => { await result.current.replayRun(runId); });
  expect(fetch).toHaveBeenCalledTimes(2);
  const exactReplay = JSON.parse(fetch.mock.calls[1][1].body as string) as Record<string, unknown>;
  expect(exactReplay.previousHomework).toBe("Үй жұмысы бойынша қысқа еске салу");

  unmount();
  const restored = renderHook(() => usePlanAi({ historyKey: "history-plan" }));
  await waitFor(() => expect(restored.result.current.runHistory).toHaveLength(2));
  expect(restored.result.current.canReplayExactly(runId)).toBe(false);
  await act(async () => { await restored.result.current.replayRun(runId); });
  expect(fetch).toHaveBeenCalledTimes(3);
  const privacySafeReplay = JSON.parse(fetch.mock.calls[2][1].body as string) as Record<string, unknown>;
  expect("previousHomework" in privacySafeReplay).toBe(false);
});

it("distinguishes generation without a textbook from retrieval failure", async () => {
  const fetch = vi.fn().mockResolvedValue(responseFor({ selected: false, textbookTitle: null, chunkCount: 0, method: null, status: "not_selected", warnings: [], sources: [] }));
  vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(() => usePlanAi());
  await act(async () => {
    await result.current.generateWithAi({ grade: 3, subjectName: "Оқу", topic: "Мәтін", learningObjectives: [], language: "ru", textbookId: null });
  });
  expect(result.current.lastRunContext?.rag.status).toBe("not_selected");
  expect(result.current.lastRunContext?.textbookSelected).toBe(false);
});
