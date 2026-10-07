/**
 * Разделы школы должны быть достижимы.
 *
 * Проверка по факту: страница существует в `src/app/school/<раздел>` — значит
 * на неё должна вести ссылка из навигации. Девять разделов были недостижимы:
 * их перечислял только `app/school/sidebar.tsx`, который никогда не
 * рендерился, а рельс содержал шесть других пунктов. Учитель не мог попасть
 * в «Классы», «Ученики», «Посещаемость» и другие разделы вообще.
 *
 * Вторая сторона проверки — обратная: в списке не должно быть ссылок на
 * несуществующие страницы. Раньше там стояли `/school/analytics`,
 * `/school/grades` и `/school/assignments`, которых в проекте нет.
 */

// @vitest-environment jsdom
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SchoolRail } from "@/components/school/school-rail";

// Рельс — клиентский компонент внутри Next: маршрут и роутер в jsdom
// отсутствуют. Без подмены компонент не отрендерится, и проверка была бы
// проверкой пустоты.
vi.mock("next/navigation", () => ({
  usePathname: () => "/school",
  useRouter: () => ({ push: vi.fn() }),
}));

const SCHOOL_DIR = join(process.cwd(), "src", "app", "school");

/** Существующие разделы школы. */
function existingSections(): string[] {
  return readdirSync(SCHOOL_DIR)
    .filter((entry) => statSync(join(SCHOOL_DIR, entry)).isDirectory());
}

/** Разделы, до которых должен быть путь из навигации. */
const NAVIGABLE = [
  "classes",
  "students",
  "teachers",
  "attendance",
  "curriculum",
  "quality",
  "reports",
  "vsk",
  "connectors",
];

/** Пункты, которые уже были в рельсе и не проверяются. */
const PRE_EXISTING = ["dashboard", "agents", "settings"];

afterEach(cleanup);

describe("навигация школы", () => {
  it.each(NAVIGABLE)("раздел %s достижим из рельса", async (section) => {
    const { MORE_SECTIONS } = await import("@/components/school/school-rail");
    const href = MORE_SECTIONS.find((s) => s.href === `/school/${section}`)?.href;
    expect(href, `нет пункта меню для раздела ${section}`).toBe(`/school/${section}`);

    render(<SchoolRail />);
    fireEvent.click(screen.getByRole("button", { name: /Ещё/ }));
    const menu = screen.getByRole("menu");
    // Ищем по адресу, а не по тексту: тексты подписей русские, а смысл
    // проверки в том, что ведёт именно эта ссылка.
    const link = menu.querySelector(`a[href="${href}"]`);
    expect(link, `в меню нет ссылки ${href}`).not.toBeNull();
  });

  it.each(NAVIGABLE)("раздел %s реально существует", (section) => {
    expect(existingSections()).toContain(section);
  });

  it("в списке нет ссылок на несуществующие страницы", async () => {
    // Битая ссылка хуже отсутствующей: учитель кликает и получает 404.
    const { MORE_SECTIONS } = await import("@/components/school/school-rail");
    const missing = MORE_SECTIONS.map((s) => s.href.replace("/school/", "")).filter(
      (slug) => !existingSections().includes(slug),
    );
    expect(missing, `нет таких страниц: ${missing.join(", ")}`).toEqual([]);
  });

  it("все существующие разделы школы покрыты навигацией", async () => {
    // Обратная полнота: страница есть, а пути к ней нет — она мертва.
    const { MORE_SECTIONS } = await import("@/components/school/school-rail");
    const linked = new Set(MORE_SECTIONS.map((s) => s.href.replace("/school/", "")));
    for (const item of PRE_EXISTING) linked.add(item);
    // create и workspace открываются кнопками и диалогами, а не пунктами меню.
    const orphans = existingSections().filter(
      (section) => !linked.has(section) && !["create", "workspace"].includes(section),
    );
    expect(orphans, `разделы без навигации: ${orphans.join(", ")}`).toEqual([]);
  });

  it("меню закрывается по Escape и не остаётся висеть поверх рабочей области", () => {
    render(<SchoolRail />);
    const button = screen.getByRole("button", { name: /Ещё/ });
    fireEvent.click(button);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("меню доступно с клавиатуры и показывает состояние раскрытия", () => {
    render(<SchoolRail />);
    const button = screen.getByRole("button", { name: /Ещё/ });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: /Ещё/ }).getAttribute("aria-expanded")).toBe("true");
  });

  it("казазские подписи разделов не являются копией русских", async () => {
    // Найдено на живом стенде: весь блок school.nav в словаре `kk` был
    // скопирован из русского, и казахский учитель видел русское меню.
    const { dictionaries } = await import("@/lib/i18n/dictionaries");
    const ruNav = dictionaries.ru.school.nav as Record<string, string>;
    const kkNav = dictionaries.kk.school.nav as Record<string, string>;
    const keys = Object.keys(kkNav);
    expect(keys.length).toBeGreaterThan(5);
    // Аббревиатуры и имена продуктов совпадают в обоих языках — это не
    // пропущенный перевод, поэтому они разрешены явно.
    const SAME_IN_BOTH = new Set(["vsk", "ksp", "workspace"]);
    const untranslated = keys.filter((key) => kkNav[key] === ruNav[key] && !SAME_IN_BOTH.has(key));
    expect(
      untranslated,
      `подписи не переведены: ${untranslated.join(", ")}`,
    ).toEqual([]);
  });
});