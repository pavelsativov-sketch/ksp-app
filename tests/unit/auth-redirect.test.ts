import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Регрессия по open redirect.
 *
 * `next` приходит из скрытого поля формы /login?next=… и уходит в
 * `redirect()`. Прежняя проверка `/^\/(?!\/)/` пропускала `/\evil.com`:
 * браузер нормализует обратный слеш в слеш и уходит на `//evil.com`.
 * Проверка продублирована здесь как чистая функция, чтобы её можно было
 * тестировать без поднятия серверного экшена.
 */
function safeNextPath(raw: string | null): string {
  if (typeof raw !== "string") return "/dashboard";
  const value = raw.trim();
  if (!value.startsWith("/")) return "/dashboard";
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return "/dashboard";
  if (value.startsWith("//")) return "/dashboard";
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "/dashboard";
  }
  if (decoded.startsWith("//") || decoded.includes("\\") || !decoded.startsWith("/")) return "/dashboard";
  return value;
}

describe("safeNextPath", () => {
  it("пропускает внутренние пути", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/plans/123/edit")).toBe("/plans/123/edit");
    expect(safeNextPath("/library?q=%D0%B4%D1%80%D0%BE%D0%B1%D0%B8")).toBe("/library?q=%D0%B4%D1%80%D0%BE%D0%B1%D0%B8");
    expect(safeNextPath("/dashboard?tab=meta")).toBe("/dashboard?tab=meta");
  });

  it("отсекает абсолютные URL", () => {
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
    expect(safeNextPath("http://evil.com")).toBe("/dashboard");
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("///evil.com")).toBe("/dashboard");
  });

  it("отсекает обратный слеш и нормализацию браузера", () => {
    expect(safeNextPath("/\\evil.com")).toBe("/dashboard");
    expect(safeNextPath("/\\/evil.com")).toBe("/dashboard");
    expect(safeNextPath("/%2F%2Fevil.com")).toBe("/dashboard");
    expect(safeNextPath("/%5C%5Cevil.com")).toBe("/dashboard");
  });

  it("любой принятый путь ведёт на этот же сайт", () => {
    // /%09/evil.com после нормализации браузером становится /evil.com —
    // это путь внутри сайта, а не внешний домен. Проверяем главное:
    // результат никогда не указывает на чужой origin.
    const candidates = [
      "/dashboard",
      "/%09/evil.com",
      "/%20/evil.com",
      "/plans/%2F%2Fevil.com",
    ];
    for (const candidate of candidates) {
      const next = safeNextPath(candidate);
      expect(new URL(next, "https://mekty.kz").origin).toBe("https://mekty.kz");
    }
  });

  it("отсекает управляющие символы и мусор", () => {
    expect(safeNextPath("/dashboard\nSet-Cookie: x=1")).toBe("/dashboard");
    expect(safeNextPath("/dashboard\u0000")).toBe("/dashboard");
    expect(safeNextPath("dashboard")).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath("/%E0%A4%A")).toBe("/dashboard"); // битый percent-encoding
  });

  it("остаётся валидным URL-адресом для redirect()", () => {
    const result = safeNextPath("/\\evil.com");
    expect(() => new URL(result, "https://mekty.kz")).not.toThrow();
    expect(new URL(result, "https://mekty.kz").origin).toBe("https://mekty.kz");
  });
});

/** Та же логика применяется к коду школы — там тоже строковый ввод. */
const joinSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6, "Код школы слишком короткий")
    .max(32, "Код школы слишком длинный")
    .regex(/^[A-Za-z0-9-]+$/, "Код школы содержит недопустимые символы"),
});

describe("схема кода школы", () => {
  it("отклоняет короткие коды, по которым можно было перебрать тенант", () => {
    expect(joinSchema.safeParse({ code: "abc" }).success).toBe(false);
    expect(joinSchema.safeParse({ code: "12345" }).success).toBe(false);
  });

  it("принимает нормальный код", () => {
    expect(joinSchema.safeParse({ code: "SCH-2026-42" }).success).toBe(true);
  });

  it("отклоняет управляющие символы и инъекции", () => {
    expect(joinSchema.safeParse({ code: "ABC\nDEF" }).success).toBe(false);
    expect(joinSchema.safeParse({ code: "ABC; DROP" }).success).toBe(false);
    expect(joinSchema.safeParse({ code: "../admin" }).success).toBe(false);
    expect(joinSchema.safeParse({ code: "A".repeat(64) }).success).toBe(false);
  });
});