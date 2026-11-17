// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { AttendanceRecorder } from "@/components/school/attendance-recorder";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const students = [
  { id: "a", name: "Алия", className: "5А" },
  { id: "b", name: "Бекзат", className: "5А" },
];

describe("AttendanceRecorder", () => {
  it("не сохраняет, пока не отмечены все ученики", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AttendanceRecorder schoolId="s1" students={students} />);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить отметки" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/Не отмечено учеников: 2/);
  });

  it("«Отметить всех присутствующими» не перетирает уже выбранные отметки", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ saved: 2 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AttendanceRecorder schoolId="s1" students={students} />);
    fireEvent.change(screen.getByLabelText("Посещаемость: Бекзат"), { target: { value: "late" } });
    fireEvent.click(screen.getByRole("button", { name: "Отметить всех присутствующими" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить отметки" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.marks).toEqual([
      { studentId: "a", status: "present" },
      { studentId: "b", status: "late" },
    ]);
  });
});
