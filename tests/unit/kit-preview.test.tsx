// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { KitPreview } from "@/components/landing/kit-preview";

afterEach(cleanup);

describe("Landing kit preview", () => {
  it("shows a lesson plan by default and switches to worksheet and slides", () => {
    render(<KitPreview />);
    expect(screen.getByRole("tab", { name: "КСП" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("Как устроено растение?");
    fireEvent.click(screen.getByRole("tab", { name: "Рабочий лист" }));
    expect(screen.getByRole("tabpanel").textContent).toContain("Знакомьтесь: растение");
    expect(screen.getByRole("tab", { name: "КСП" }).getAttribute("aria-selected")).toBe("false");
    fireEvent.click(screen.getByRole("tab", { name: "Презентация" }));
    expect(screen.getByRole("tabpanel").textContent).toContain("У каждого листа");
    expect(screen.getByText(".pptx")).toBeTruthy();
  });

  it("supports keyboard navigation with roving focus", () => {
    render(<KitPreview />);
    const plan = screen.getByRole("tab", { name: "КСП" });
    plan.focus();
    fireEvent.keyDown(plan, { key: "ArrowRight" });
    const sheet = screen.getByRole("tab", { name: "Рабочий лист" });
    expect(document.activeElement).toBe(sheet);
    expect(sheet.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(sheet, { key: "End" });
    const slides = screen.getByRole("tab", { name: "Презентация" });
    expect(document.activeElement).toBe(slides);
    fireEvent.keyDown(slides, { key: "ArrowRight" });
    expect(document.activeElement).toBe(plan);
    fireEvent.keyDown(plan, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(slides);
    fireEvent.keyDown(slides, { key: "Home" });
    expect(document.activeElement).toBe(plan);
  });
});
