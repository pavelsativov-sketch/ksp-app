// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { getPlanExamples } from "@/lib/plan-examples";
import { kspContentSchema } from "@/lib/validation/ksp";
import NewPlanPage from "@/app/plans/new/page";
import DashboardPage from "@/app/dashboard/page";

const mocks = vi.hoisted(() => ({ user: vi.fn(), subjects: vi.fn(), getDb: vi.fn(), form: vi.fn(), filter: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/mongo", () => ({ getDb: mocks.getDb, isMongoConfigured: () => true, COL: { plans: "lesson_plans" } }));
vi.mock("@/lib/plans-repo", () => ({ listSubjects: mocks.subjects }));
vi.mock("@/components/ksp/plan-form", () => ({ PlanForm: mocks.form }));
vi.mock("@/components/ksp/plans-filter", () => ({ PlansFilter: mocks.filter }));
vi.mock("@/lib/assignments", () => ({ listTeacherAssignments: async () => [] }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const subject = { id: "507f1f77bcf86cd799439011", name_ru: "Математика", name_kz: null, grade_min: 1, grade_max: 6 };

it("only offers available subjects at valid grades with schema-valid local content", () => {
  const [example] = getPlanExamples([subject]);
  expect(example.plan).toMatchObject({ subject_id: subject.id, grade: 5, visibility: "private", content: { topic: "Обыкновенные дроби" } });
  expect(kspContentSchema.safeParse(example.plan.content).success).toBe(true);
  expect(example.plan.content.learningObjectives).toEqual([]);
  expect(getPlanExamples([])).toEqual([]);
  expect(getPlanExamples([{ ...subject, grade_max: 4 }])).toEqual([]);
});

it("offers one-click examples on the manual page and passes selected content to the full editor", async () => {
  vi.stubGlobal("React", React);
  mocks.user.mockResolvedValue({ id: "user" });
  mocks.subjects.mockResolvedValue([subject]);
  mocks.form.mockReturnValue(null);
  render(await NewPlanPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("link", { name: "Пример: Математика, 5 класс" }).getAttribute("href")).toBe(`/plans/new?example=${subject.id}`);
  expect(mocks.form.mock.calls[0][0].initialPlan).toBeUndefined();
  cleanup();
  render(await NewPlanPage({ searchParams: Promise.resolve({ example: subject.id }) }));
  expect(mocks.form.mock.calls.at(-1)?.[0]).toMatchObject({ exampleKey: subject.id, initialPlan: { subject_id: subject.id, content: { topic: "Обыкновенные дроби" } } });
  expect(screen.getByRole("link", { name: /Вручную/ }).getAttribute("href")).toBe("/plans/new");
  cleanup();
  render(await NewPlanPage({ searchParams: Promise.resolve({ example: [subject.id, "bad"] }) }));
  expect(mocks.form.mock.calls.at(-1)?.[0].initialPlan).toBeUndefined();
});

it("shows dashboard onboarding only for an empty archive, preserving PlansFilter props", async () => {
  vi.stubGlobal("React", React);
  mocks.user.mockResolvedValue({ id: "user" });
  mocks.subjects.mockResolvedValue([subject]);
  const toArray = vi.fn().mockResolvedValue([]);
  const cursor = { sort: vi.fn(), limit: vi.fn(), toArray };
  cursor.sort.mockReturnValue(cursor); cursor.limit.mockReturnValue(cursor);
  mocks.getDb.mockResolvedValue({ collection: () => ({ find: () => cursor }) });
  render(await DashboardPage());
  expect(screen.getByRole("link", { name: /Пример: Математика/ })).toBeTruthy();
  expect(mocks.filter).not.toHaveBeenCalled();
  cleanup();
  toArray.mockResolvedValue([{ _id: "plan", title: "Draft", grade: 5, is_draft: true, visibility: "private", updated_at: new Date(), content: {} }]);
  mocks.filter.mockReturnValue(null);
  render(await DashboardPage());
  expect(mocks.filter.mock.calls[0][0]).toMatchObject({ showVisibility: true, showEditLink: true, plans: [{ is_draft: true }] });
  expect(screen.queryByRole("link", { name: /Пример: Математика/ })).toBeNull();
});
