// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QrCodeSvg, QrCard } from "@/components/ksp/qr-card";

/**
 * QR-плашка печатается вместе с планом, поэтому важно, что код настоящий
 * и читаемый камерой, а заглушка.
 */

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => cleanup());

/** Ждём асинхронную генерацию SVG внутри компонента. */
async function waitForQr() {
  await vi.waitFor(() => {
    expect(document.querySelector("svg")).toBeTruthy();
  });
  return document.querySelector("svg")!;
}

it("генерирует настоящий QR-код со ссылкой", async () => {
  const { container } = render(<QrCodeSvg text="https://mekty.kz/plans/abc123" />);
  const svg = await waitForQr();
  // Код — это сетка модулей, а не картинка-заглушка.
  expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
  expect(svg.innerHTML).toMatch(/d="M/);
  expect(container.querySelector(".animate-pulse")).toBeNull();
});

it("выдаёт разные QR для разных ссылок", async () => {
  render(<QrCodeSvg text="https://mekty.kz/plans/one" />);
  const first = (await waitForQr()).innerHTML;
  cleanup();
  render(<QrCodeSvg text="https://mekty.kz/plans/two" />);
  const second = (await waitForQr()).innerHTML;
  expect(first).not.toBe(second);
});

it("показывает понятный текст, если ссылка слишком длинная", async () => {
  const long = `https://mekty.kz/plans/${"x".repeat(4000)}`;
  render(<QrCodeSvg text={long} />);
  await vi.waitFor(() => {
    expect(screen.getByText(/слишком длинн/i)).toBeTruthy();
  });
});

describe("QrCard", () => {
  it("показывает QR, ссылку и обе кнопки", async () => {
    render(<QrCard url="https://mekty.kz/plans/abc" title="Дроби" />);
    await waitForQr();
    expect(screen.getByText("https://mekty.kz/plans/abc")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Печать/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Копия/i })).toBeTruthy();
  });

  it("копирует ссылку в буфер обмена", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<QrCard url="https://mekty.kz/plans/abc" title="Дроби" />);
    await waitForQr();
    screen.getByRole("button", { name: /Копия/i }).click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("https://mekty.kz/plans/abc"));
  });
});
