// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TimeAgo } from "@/components/ksp/time-ago";
import { VskSpravkaClient } from "@/components/school/vsk-spravka-client";

/**
 * Гидратационная безопасность времени на странице.
 *
 * Эти строки раньше считались на обоих концах в разные моменты «сейчас»:
 * на границе минуты между отдачей HTML и гидрацией React падал с ошибкой
 * 418 (сервер отдал «1 мин назад», клиент посчитал «2 мин назад»). Тест
 * ловит сам класс таких багов: серверный HTML не должен зависеть от часа
 * часов, а относительное время — появляться только после гидрации.
 */

const NOW = new Date("2026-10-16T09:00:00.000+05:00"); // = 04:00 UTC

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TimeAgo", () => {
  it("серверный HTML — абсолютная дата, одинаковая на сервере и при гидрации", () => {
    // 21:15 Астаны 15 октября — после гидрации было бы «мин назад», но в
    // серверной разметке его быть не должно: якобы сравнение с «сейчас».
    const markup = renderToStaticMarkup(<TimeAgo iso="2026-10-15T21:15:00.000+05:00" locale="ru" />);

    expect(markup).toContain("15.10.2026");
    expect(markup).not.toContain("мин назад");
    expect(markup).not.toContain("только что");
  });

  it("после гидрации показывает «х мин назад» без пересчёта даты", () => {
    // Ровно за минуту до NOW: на границе минут раньше вставал React 418.
    render(<TimeAgo iso="2026-10-16T08:59:00.000+05:00" locale="ru" />);

    expect(screen.getByText("1 мин назад")).toBeTruthy();
  });

  it("свежий комментарий — «только что» независимо от часового пояса сервера", () => {
    render(<TimeAgo iso="2026-10-16T08:59:15.000+05:00" locale="ru" />);

    expect(screen.getByText("только что")).toBeTruthy();
  });

  it("казахский текст — «жаңа ғана»", () => {
    render(<TimeAgo iso="2026-10-16T08:59:15.000+05:00" locale="kk" />);

    expect(screen.getByText("жаңа ғана")).toBeTruthy();
  });

  it("старое время («30 дн назад») сворачивается в дату, а не в «230 дн назад»", () => {
    render(<TimeAgo iso="2026-02-01T09:00:00.000+05:00" locale="ru" />);

    // Абсолютная подсказка содержит полный момент публикации.
    const shown = screen.getByTitle(/01.02.2026/);
    expect(shown).toBeTruthy();
    expect(shown.textContent).toBe("01.02.2026, 09:00");
  });
});

describe("Справка ВШК", () => {
  it("сервер отдаёт поле даты пустым: её считает браузер", () => {
    // Раньше сюда попадало new Date().toLocaleDateString(): сервер и браузер
    // расходились между 19:00 UTC и 05:00 UTC по Астане — это был тихий
    // источник ошибки гидратации 418.
    const markup = renderToStaticMarkup(<VskSpravkaClient />);

    expect(markup).toContain('value=""');
    expect(markup).not.toContain('value="16.10.2026"');
  });

  it("после гидрации дата подставляется по часам браузера", () => {
    render(<VskSpravkaClient />);

    expect(
      screen.getByLabelText("Сроки / Дата проведения проверки") as HTMLInputElement,
    ).toHaveProperty("value", new Date().toLocaleDateString("ru-RU"));
  });
});
