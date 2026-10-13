// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyKsp } from "@/lib/types/ksp";
import type { PlanVersionRow } from "@/lib/plan-versions";
const mock = vi.hoisted(() => ({ restore: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/actions/plans", () => ({ restorePlanVersionAction: mock.restore }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
vi.mock("@/components/ksp/plan-view", () => ({ PlanView: () => <p>Полный текст снимка</p> }));
import { PlanHistory } from "@/components/ksp/plan-history";
const timestamp = "2026-09-17T12:00:00.000Z";
const version: PlanVersionRow = { id: "version", created_at: timestamp, reason: "draft", is_draft: true,
  plan: { id: "plan", owner_id: "owner", title: "Старое название", subject_id: null, grade: 5, quarter: null, section: null,
    visibility: "public", language: "ru", content: { ...emptyKsp(), topic: "Дроби" }, created_at: timestamp, updated_at: timestamp } };
const currentPlan: PlanVersionRow["plan"] = { ...version.plan, title: "Текущее название", content: { ...emptyKsp(), topic: "Текущая тема", values: "Текущий контекст" } };
beforeEach(() => { vi.clearAllMocks(); mock.restore.mockResolvedValue({ id: "plan", updated_at: timestamp }); });
afterEach(cleanup);
it("shows a section diff before explicit full restore and sends the current revision", async () => {
  render(<PlanHistory planId="plan" currentUpdatedAt={timestamp} currentPlan={currentPlan} versions={[version]} />);
  expect(screen.queryByRole("button", { name: "Восстановить всю версию" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Сравнить" }));
  expect(mock.restore).not.toHaveBeenCalled();
  expect(screen.getByText("Полное содержимое выбранной версии")).toBeTruthy();
  expect(screen.getAllByText("Сейчас:")).toHaveLength(3);
  expect(screen.getByText("topic").parentElement?.textContent).toContain("Изменено поле");
  fireEvent.click(screen.getByRole("button", { name: "Восстановить всю версию" }));
  await waitFor(() => expect(mock.restore).toHaveBeenCalledWith({ plan_id: "plan", version_id: "version", expected_updated_at: timestamp }));
  await waitFor(() => expect(mock.refresh).toHaveBeenCalled());
});
it("restores only checked sections", async () => {
  render(<PlanHistory planId="plan" currentUpdatedAt={timestamp} currentPlan={currentPlan} versions={[version]} />);
  fireEvent.click(screen.getByRole("button", { name: "Сравнить" }));
  const checkboxes = screen.getAllByRole("checkbox");
  expect(checkboxes).toHaveLength(3);
  fireEvent.click(checkboxes[0]);
  fireEvent.click(checkboxes[2]);
  fireEvent.click(screen.getByRole("button", { name: "Восстановить отмеченные (1)" }));
  await waitFor(() => expect(mock.restore).toHaveBeenCalledWith({
    plan_id: "plan", version_id: "version", expected_updated_at: timestamp, sections: ["objectives"],
  }));
});
it("cancel does not mutate and returned errors remain visible", async () => {
  mock.restore.mockResolvedValue({ error: "План изменился" });
  render(<PlanHistory planId="plan" currentUpdatedAt={timestamp} currentPlan={currentPlan} versions={[version]} />);
  fireEvent.click(screen.getByRole("button", { name: "Сравнить" }));
  fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
  expect(mock.restore).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Сравнить" }));
  fireEvent.click(screen.getByRole("button", { name: "Восстановить всю версию" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("План изменился"));
  expect(mock.refresh).not.toHaveBeenCalled();
});
it("handles network exceptions without throwing into the UI", async () => {
  mock.restore.mockRejectedValue(new Error("network"));
  render(<PlanHistory planId="plan" currentUpdatedAt={timestamp} currentPlan={currentPlan} versions={[version]} />);
  fireEvent.click(screen.getByRole("button", { name: "Сравнить" }));
  fireEvent.click(screen.getByRole("button", { name: "Восстановить всю версию" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Не удалось восстановить"));
});
