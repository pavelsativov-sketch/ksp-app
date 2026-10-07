/**
 * Основной сценарий учителя: вход → урок → все материалы → экспорт.
 *
 * Сценарий закрывает то, что юнит-тестами не проверить: что страницы
 * действительно открываются, что кнопки приводят в нужные места и что
 * экспорт отдаёт файл. Раньше интерфейс проверялся только вручную.
 *
 * Генерация с участием ИИ намеренно не запускается: она занимает около
 * полутора минут и тратит квоту, из-за чего прогон становится нестабильным.
 * Качество генерации проверяется в tests/unit.
 *
 * Сессия берётся из общего файла cookies (проект setup), а не входит заново:
 * сервер разрешает 10 входов на почту за 15 минут.
 */

import { test, expect } from "@playwright/test";
import { createPlanFromExample, planIdFrom } from "./helpers/accounts";

test.describe("сценарий урока", () => {
  test("личный архив открыт и вход состоялся", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /мои планы/i })).toBeVisible();
  });

  test("план сохраняется и открывается страница урока", async ({ page }) => {
    const planUrl = await createPlanFromExample(page);

    await expect(page).toHaveURL(/\/plans\/[a-f0-9]{24}/);
    // Страница урока обязана открыться. Раньше она падала в 500 из-за
    // серверного компонента, вызывавшего клиентский хук, и это было видно
    // только при ручной проверке.
    await expect(page.getByText(/Не удалось открыть страницу/)).toHaveCount(0);
    // Гейт качества — первое, что видит учитель после сохранения.
    await expect(page.getByText(/готовность к уроку/i)).toBeVisible();
    expect(planIdFrom(planUrl)).toBeTruthy();
  });

  test("на странице урока есть все материалы", async ({ page }) => {
    await createPlanFromExample(page);

    // Рабочий лист, памятки и кроссворд открывают панель — это кнопки.
    for (const name of [/рабочий лист/i, /памятки/i, /кроссворд/i]) {
      await expect(page.getByRole("button", { name }).first()).toBeVisible();
    }
    // Презентация, документ и комплект сразу отдают файл — это ссылки.
    // Раньше проверка искала здесь кнопку и падала: элемент по имени один,
    // но роль другая.
    for (const name of [/презентация/i, /пакет/i]) {
      await expect(page.getByRole("link", { name }).first()).toBeVisible();
    }
  });

  test("панель настроек памяток открывается и предлагает генерацию", async ({ page }) => {
    await createPlanFromExample(page);

    // Диалог предпросмотра открывается только после «Создать и посмотреть»,
    // а это вызов ИИ: он занимает полторы минуты и тратит квоту, поэтому
    // в обычном прогоне проверяем панель настроек, а сам предпросмотр — в
    // отдельном сценарии handout-preview.spec.ts (включается E2E_AI=1).
    await page.getByRole("button", { name: /памятки/i }).first().click();

    await expect(page.getByRole("button", { name: /^12$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^20$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /создать и посмотреть/i })).toBeVisible();
  });

  test("разделы школы достижимы из навигации", async ({ page }) => {
    await page.goto("/school");
    await page.getByRole("button", { name: /Ещё/i }).click();
    // Девять разделов школы были недостижимы: на них не вёл ни один пункт
    // меню, потому что единственная навигация лежала в неиспользуемом файле.
    for (const name of [/Классы/i, /Учащиеся/i, /Педагоги/i, /Посещаемость/i]) {
      await expect(page.getByRole("menuitem", { name })).toBeVisible();
    }
  });

  test("экспорт презентации отдаёт настоящий pptx", async ({ page }) => {
    const planId = planIdFrom(await createPlanFromExample(page));

    // Проверяем маршрут напрямую: так мы убеждаемся, что презентация
    // собирается, а не только то, что кнопка нажимается.
    const response = await page.request.get(`/api/export/pptx/${planId}`);
    expect(response.status(), "экспорт презентации").toBe(200);
    expect(response.headers()["content-type"]).toContain("presentationml");

    const body = await response.body();
    expect(body.byteLength).toBeGreaterThan(5000);
    // Настоящий pptx — zip-архив: первые два байта «PK».
    expect(body[0]).toBe(0x50);
    expect(body[1]).toBe(0x4b);
  });

  test("экспорт документа отдаёт настоящий docx", async ({ page }) => {
    const planId = planIdFrom(await createPlanFromExample(page));

    const response = await page.request.get(`/api/export/docx/${planId}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("wordprocessingml");
    const body = await response.body();
    expect(body.byteLength).toBeGreaterThan(5000);
    expect(body[0]).toBe(0x50);
    expect(body[1]).toBe(0x4b);
  });
});

test.describe("доступ закрыт", () => {
  test("без входа личный архив недоступен", async ({ browser }) => {
    // Отдельный контекст без cookies: сессия из setup сюда не попадает.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("чужой план не отдаётся", async ({ page }) => {
    // Случайный валидный ObjectId: доступ к чужому плану должен быть отказом,
    // а не содержимым документа.
    const response = await page.request.get("/api/export/docx/0123456789abcdef01234567");
    expect([401, 404]).toContain(response.status());
  });

  test("платный КТП недоступен тестовому учителю", async ({ page }) => {
    const planId = planIdFrom(await createPlanFromExample(page));

    const response = await page.request.post("/api/ktp", {
      data: { planId, topics: ["Тема"] },
    });
    // Ограничение тарифа на месте. Если здесь 200 — значит биллинг обходится,
    // и это ровно то, чего сценарий не должен допускать.
    expect(response.status()).toBe(403);
  });
});