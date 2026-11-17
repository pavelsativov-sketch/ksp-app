// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BrowserWarmupLink } from "@/components/school/browser-warmup-link";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("прогревает браузер по намерению открыть сервис и не дублирует запросы", () => {
  render(<BrowserWarmupLink href="/school/workspace?tab=browser">Открыть BilimClass</BrowserWarmupLink>);
  const link = screen.getByRole("link", { name: "Открыть BilimClass" });
  fireEvent.pointerEnter(link);
  fireEvent.focus(link);
  fireEvent.pointerDown(link);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/health/browser-keepalive", { cache: "no-store" });
});
