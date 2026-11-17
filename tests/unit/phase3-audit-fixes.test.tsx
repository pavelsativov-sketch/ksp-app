// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HomeworkRunner } from "@/components/assignments/homework-runner";
import { PricingLeadButton } from "@/components/pricing/pricing-lead-modal";
import {
  PersonalAttendanceView,
  PersonalClassesView,
  PersonalSchoolDashboard,
} from "@/components/school/personal-school-views";
import type { TeacherJournalAnalytics } from "@/lib/journal";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/school/dashboard",
}));

afterEach(() => {
  cleanup();
});

const sampleAnalytics: TeacherJournalAnalytics = {
  hasData: true,
  students: [
    {
      id: "st1",
      fullName: "Алимов Санжар",
      className: "7А",
      source: "homework",
      averageScore: 8.5,
      scoresCount: 2,
      qualityPercent: 100,
      excusedCount: 1,
      unexcusedCount: 0,
      sickCount: 0,
    },
  ],
  classes: [
    {
      className: "7А",
      studentsCount: 1,
      avgScore: 8.5,
      qualityPercent: 100,
      attendanceRate: 0.75,
    },
  ],
  attendance: {
    total: 4,
    present: 3,
    excused: 1,
    unexcused: 0,
    sick: 0,
    rate: 0.75,
    perDay: [{ date: "2026-11-18", rate: 0.75 }],
  },
  subjects: [
    {
      subject: "Алгебра",
      avgScore: 8.5,
      qualityPercent: 100,
      entriesCount: 2,
    },
  ],
  plansCount: 5,
  ktpCount: 1,
};

describe("Phase 3 audit fixes", () => {
  it("renders math formulas cleanly inside student HomeworkRunner (/a/[code])", () => {
    const { container } = render(
      <HomeworkRunner
        assignment={{
          code: "ABC123",
          title: "Квадратные уравнения",
          subject: "Алгебра",
          grade: 8,
          closed: false,
          total: 1,
          feedbackMode: "correct_only",
          tasks: [
            {
              id: "t1",
              type: "MCQ",
              question: "Вычислите $\\frac{3}{4} + x^2$",
              points: 2,
              options: ["$\\frac{7}{4}$", "$x_1$"],
            },
          ],
        }}
      />,
    );

    const input = screen.getByPlaceholderText(/имя|аты/i);
    fireEvent.change(input, { target: { value: "Санжар" } });
    fireEvent.click(screen.getByRole("button"));

    expect(container.textContent).not.toContain("\\frac");
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("4");
  });

  it("opens Pro purchase lead modal without requiring login", () => {
    render(<PricingLeadButton kind="purchase_pro" label="Купить Pro (Kaspi / заявка)" />);
    fireEvent.click(screen.getByRole("button", { name: /Купить Pro/i }));
    expect(screen.getByText(/Подключить Учитель Pro/i)).toBeTruthy();
    expect(screen.getByLabelText(/Ваше ФИО/i)).toBeTruthy();
  });

  it("renders personal teacher dashboard, classes, and attendance without NoSchool wall", () => {
    render(<PersonalSchoolDashboard data={sampleAnalytics} />);
    expect(screen.getByText(/Обзор классов, журнала и КТП/i)).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
    cleanup();

    render(<PersonalClassesView data={sampleAnalytics} />);
    expect(screen.getByText("7А")).toBeTruthy();
    cleanup();

    render(<PersonalAttendanceView data={sampleAnalytics} />);
    expect(screen.getAllByText("75%").length).toBeGreaterThanOrEqual(1);
  });
});
