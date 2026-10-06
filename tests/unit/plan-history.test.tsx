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
beforeEach(() => { vi.clearAllMocks(); mock.restore.mockResolvedValue({ id: "plan", updated_at: timestamp }); });
afterEach(cleanup);
it("shows preview before explicit restore and sends the current revision", async () => {
  render(<PlanHistory planId="plan" currentUpdatedAt={timestamp} versions={[version]} />);
  expect(screen.queryByRole("button", { name: "Восстановить" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Посмотреть" }));
  expect(mock.restore).not.toHaveBeenCalled();
  expect(screen.getByText("Полное содержимое версии")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Восстановить" }));
  await waitFor(() => expect(mock.restore).toHaveBeenCalledWith({ plan_id: "plan", version_id: "version", expected_updated_at: timestamp }));
  await waitFor(() => expect(mock.refresh).toHaveBeenCalled());
});
it("cancel does not mutate and returned errors remain visible", async () => {
  mock.restore.mockResolvedValue({ error: "План изменился" });
  render(<PlanHistory planId="plan" currentUpdatedAt={timestamp} versions={[version]} />);
  fireEvent.click(screen.getByRole("button", { name: "Посмотреть" }));
  fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
  expect(mock.restore).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Посмотреть" }));
  fireEvent.click(screen.getByRole("button", { name: "Восстановить" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("План изменился"));
  expect(mock.refresh).not.toHaveBeenCalled();
});
it("handles network exceptions without throwing into the UI", async () => {
  mock.restore.mockRejectedValue(new Error("network"));
  render(<PlanHistory planId="plan" currentUpdatedAt={timestamp} versions={[version]} />);
  fireEvent.click(screen.getByRole("button", { name: "Посмотреть" }));
  fireEvent.click(screen.getByRole("button", { name: "Восстановить" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Не удалось восстановить"));
});
