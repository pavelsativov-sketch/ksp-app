// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssignmentAnalytics } from "@/components/assignments/assignment-analytics";
import type { AssignmentResults } from "@/lib/assignments";

function analyticsFor(stats: {
  suppressed: boolean;
  participants: number | null;
  responseCount: number | null;
  correctCount: number | null;
  incorrectCount: number | null;
  accuracyPercent: number | null;
  attemptCount: number | null;
  omittedCount: number | null;
}): AssignmentResults["analytics"] {
  return {
    hasData: true,
    minimumGroupSize: 5,
    overallParticipants: stats.participants,
    tasks: [{ taskIndex: 0, question: "Сравните дроби", objectiveCode: "5.1.2.1", ...stats }],
    objectives: [{ objectiveCode: "5.1.2.1", ...stats }],
  };
}

describe("AssignmentAnalytics", () => {
  it("suppresses all comparison metrics for groups below five", () => {
    render(
      <AssignmentAnalytics
        locale="ru"
        analytics={analyticsFor({
          suppressed: true,
          participants: null,
          responseCount: null,
          correctCount: null,
          incorrectCount: null,
          accuracyPercent: null,
          attemptCount: null,
          omittedCount: null,
        })}
      />,
    );

    expect(screen.getAllByText(/Статистика группы скрыта/)).toHaveLength(2);
    expect(screen.queryByText(/100%/)).toBeNull();
  });

  it("shows legacy omission counts as unavailable rather than zero", () => {
    render(
      <AssignmentAnalytics
        locale="kk"
        analytics={analyticsFor({
          suppressed: false,
          participants: 6,
          responseCount: 6,
          correctCount: 4,
          incorrectCount: 2,
          accuracyPercent: 67,
          attemptCount: 9,
          omittedCount: null,
        })}
      />,
    );

    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getAllByText(/Жауапсыз/)).toHaveLength(2);
    expect(screen.getByText(/Жіберілімдерге қайталау/)).toBeTruthy();
  });

  it("does not render a zero percent when a task has no responses", () => {
    render(
      <AssignmentAnalytics
        locale="ru"
        analytics={analyticsFor({
          suppressed: false,
          participants: 5,
          responseCount: 0,
          correctCount: 0,
          incorrectCount: 0,
          accuracyPercent: null,
          attemptCount: 5,
          omittedCount: 0,
        })}
      />,
    );

    expect(screen.getAllByText("Для этого задания пока нет ответов.")).toHaveLength(2);
    expect(screen.queryByText(/0%/)).toBeNull();
  });
});
