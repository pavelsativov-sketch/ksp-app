// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AppError from "@/app/error";

afterEach(cleanup);

describe("Error boundary", () => {
  it("offers recovery without rendering error messages or secrets", () => {
    const retry = vi.fn();
    const reset = vi.fn();
    render(<AppError error={new Error("private-token-test")} unstable_retry={retry} reset={reset} />);
    expect(screen.queryByText(/private-token-test/)).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Попробовать снова" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });
  it("supports reset when retry is unavailable", () => {
    const reset = vi.fn();
    render(<AppError error={new Error("private")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Попробовать снова" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Мои планы" }).getAttribute("href")).toBe("/dashboard");
  });
});
