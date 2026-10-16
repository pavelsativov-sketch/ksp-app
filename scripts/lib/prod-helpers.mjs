/**
 * Общие шаги для проверок развёрнутой ОС.
 *
 * Здесь живёт то, что нужно любой проверке: вход тестовым учителем и
 * закрытие окна первого входа.
 */

/**
 * Закрывает окно первого входа.
 *
 * Новый учитель после регистрации видит приветственное окно
 * «Первый вход в Mekty». Оно перекрывает всю страницу, и пока его не
 * закрыли, ни поле задачи агента, ни кнопки недоступны — проверка падала бы
 * не из-за ОС, а из-за окна. Учитель его пропускает, так же поступаем и мы.
 */
export async function dismissFirstRunDialog(page) {
  const dialog = page.locator('[aria-label="Первый вход в Mekty"]');
  // Окно появляется не сразу: рабочая область сначала монтируется, потом
  // приходит состояние онбординга. Проверка «появилось ли оно сейчас»
  // промахивалась, и окно оставалось висеть поверх всей страницы — тогда
  // половина напечатанных символов терялась, а Ctrl+Enter уходил в диалог.
  const shown = await dialog
    .waitFor({ state: "visible", timeout: 12_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return false;
  await page.getByRole("button", { name: /^Пропустить$/ }).click({ timeout: 15_000 }).catch(() => {});
  await dialog.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  return true;
}

/** Загружает страницу и убирает окно первого входа, если оно появилось. */
export async function openWorkspace(page, baseUrl) {
  await page.goto(`${baseUrl}/school/workspace`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await dismissFirstRunDialog(page);
  await page.waitForTimeout(1200);
}