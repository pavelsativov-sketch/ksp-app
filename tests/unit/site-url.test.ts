/**
 * Публичный адрес сайта не должен расходиться с фактическим портом.
 *
 * Найдено на живом стенде: собранное приложение поднималось на 3000, а в
 * `og:url` и ссылках на OG-картинку стоял жёстко зашитый 3100. Соцсети и
 * мессенджеры получали нерабочие ссылки.
 */

import { afterEach, describe, expect, it } from "vitest";

import { getSiteUrl } from "@/lib/site";

afterEach(() => {
  delete process.env.APP_URL;
  delete process.env.PORT;
});

describe("адрес сайта", () => {
  it("без настройки берёт порт из PORT", () => {
    process.env.PORT = "3000";
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });

  it("без PORT по умолчанию 3000, а не 3100", () => {
    // Именно это значение попадало в og:url и ломало ссылки в соцсетях.
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });

  it("APP_URL важнее PORT", () => {
    process.env.APP_URL = "https://mekty.kz";
    process.env.PORT = "3000";
    expect(getSiteUrl()).toBe("https://mekty.kz");
  });

  it("отбрасывает путь и слеш в APP_URL", () => {
    process.env.APP_URL = "https://mekty.kz/plans/";
    expect(getSiteUrl()).toBe("https://mekty.kz");
  });

  it.each(["ftp://mekty.kz", "https://user:pass@mekty.kz", "not-a-url"])(
    "отклоняет некорректный APP_URL %s",
    (value) => {
      process.env.APP_URL = value;
      expect(() => getSiteUrl()).toThrow();
    },
  );

  it("игнорирует нечисловой PORT, а не падает", () => {
    // Значение приходит из окружения и может быть любым: «abc» не должно
    // приводить к адресу вида localhost:abc.
    process.env.PORT = "abc";
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });
});