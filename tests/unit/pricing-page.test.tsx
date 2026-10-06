// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import PricingPage, { metadata } from "@/app/pricing/page";

afterEach(cleanup);

describe("Mekty pricing", () => {
  it("preserves all three tariffs and their destinations", async () => {
    render(await PricingPage());
    expect(screen.getAllByRole("article")).toHaveLength(3);
    const free = within(screen.getByRole("article", { name: "Старт" }));
    expect(free.getByText("0 ₸")).toBeTruthy();
    expect(free.getByRole("link", { name: "Начать бесплатно" }).getAttribute("href")).toBe("/register");
    const pro = within(screen.getByRole("article", { name: "Учитель Pro" }));
    expect(pro.getByText("2 490 ₸")).toBeTruthy();
    expect(pro.getByRole("link", { name: "Активировать код" }).getAttribute("href")).toBe("/redeem");
    expect(screen.getByRole("article", { name: "Школа" }).textContent).toContain("9 900 ₸");
    expect(metadata.title).toBe("Тарифы — Mekty");
  });
});
