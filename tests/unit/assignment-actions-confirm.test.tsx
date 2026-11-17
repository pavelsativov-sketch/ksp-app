// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { AssignmentActions } from "@/components/assignments/assignment-actions";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AssignmentActions: закрытие приёма", () => {
  it("не закрывает без подтверждения", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AssignmentActions id="a1" code="123456" status="open" />);
    fireEvent.click(screen.getByRole("button", { name: /Закрыть приём/ }));
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("закрывает после подтверждения", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AssignmentActions id="a1" code="123456" status="open" />);
    fireEvent.click(screen.getByRole("button", { name: /Закрыть приём/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/assignments/a1?action=close", { method: "POST" }));
  });
});
