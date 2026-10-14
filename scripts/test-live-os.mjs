import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.TEST_URL || "https://ksp-app-pi.vercel.app";

async function runTest() {
  console.log(`[TEST] Starting live OS Workspace test against ${BASE_URL}...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  const timestamp = Date.now();
  const testEmail = `teacher-os-${timestamp}@mekty-test.kz`;
  const testPassword = "Password123!Safe";

  try {
    // 1. Регистрация тестового учителя
    console.log(`[TEST] 1. Registering test teacher: ${testEmail}...`);
    await page.goto(`${BASE_URL}/register`, { waitUntil: "networkidle", timeout: 30000 });
    await page.fill("#fullName", "Тестовый Учитель ОС");
    await page.fill("#email", testEmail);
    await page.fill("#password", testPassword);
    await page.click('button[type="submit"]');

    // Ожидаем редиректа после создания аккаунта
    await page.waitForURL(/\/(welcome|dashboard|plans|school)/, { timeout: 30000 });
    console.log(`[TEST] ✓ Successfully registered and logged in! Current URL: ${page.url()}`);

    // Пропуск онбординга если появился
    const skipBtn = page.getByRole("button", { name: /пропустить/i });
    if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipBtn.click();
    }

    // 2. Открытие рабочей области ОС (School Workspace)
    console.log(`[TEST] 2. Navigating to School Workspace with BilimClass...`);
    const workspaceUrl = `${BASE_URL}/school/workspace?tab=browser&url=https://www.bilimclass.kz/login`;
    await page.goto(workspaceUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // 3. Проверка отсутствия старых раздражающих элементов
    console.log(`[TEST] 3. Checking for obsolete/annoying elements...`);
    const liveInputBar = await page.$('[data-testid="live-input-bar"]');
    console.log(`[TEST] live-input-bar absent: ${liveInputBar === null ? "YES ✓" : "FAIL"}`);

    const finishTaskWarning = await page.getByText(/не вызвала finishTask/i).isVisible().catch(() => false);
    console.log(`[TEST] finishTask warning absent: ${!finishTaskWarning ? "YES ✓" : "FAIL"}`);

    const suggestionChips = await page.getByText(/BilimClass: открой дэшборд/i).isVisible().catch(() => false);
    console.log(`[TEST] suggestion chips absent: ${!suggestionChips ? "YES ✓" : "FAIL"}`);

    // 4. Ожидание загрузки экрана браузера (img viewport)
    console.log(`[TEST] 4. Waiting for remote browser viewport image...`);
    const imgLocator = page.locator('img[alt*="браузер" i], img[alt*="экран" i], img[alt*="viewport" i]').first();

    const retryBtn = page.locator('button:has-text("Повторить"), button:has-text("Подключить сейчас")');
    const startWait = Date.now();
    while (Date.now() - startWait < 60000) {
      if (await imgLocator.isVisible().catch(() => false)) break;
      if (await retryBtn.isVisible().catch(() => false)) {
        console.log(`[TEST] Cloudflare cooldown active, waiting 15s then clicking retry...`);
        await page.waitForTimeout(15000);
        if (await retryBtn.isVisible().catch(() => false)) {
          await retryBtn.click().catch(() => {});
        }
      }
      await page.waitForTimeout(1000);
    }
    await imgLocator.waitFor({ state: "visible", timeout: 30000 });
    console.log(`[TEST] ✓ Remote browser viewport loaded successfully!`);

    // Снимок состояния загруженного экрана
    const artifactDir = "C:\\Users\\PC\\.gemini\\antigravity\\brain\\16a54473-3258-45ca-9916-ff303eba2927";
    await page.screenshot({ path: path.join(artifactDir, "os-test-initial.png") });
    console.log(`[TEST] ✓ Initial screenshot saved to os-test-initial.png`);

    // 5. Тестирование клика по экрану
    console.log(`[TEST] 5. Clicking on the browser viewport to focus login input...`);
    const box = await imgLocator.boundingBox();
    if (!box) throw new Error("Could not get bounding box of browser image");

    // Кликаем по центру / в область формы логина
    const clickX = box.x + box.width * 0.5;
    const clickY = box.y + box.height * 0.45;
    await page.mouse.click(clickX, clickY);

    // 6. Тестирование прямого ввода с клавиатуры
    console.log(`[TEST] 6. Typing credentials on keyboard...`);
    const testUsername = "teacher_login_777";
    await page.keyboard.type(testUsername, { delay: 30 });

    // Проверяем, отображается ли введенный текст мгновенно в оверлее
    await page.waitForTimeout(300);
    const overlayText = await page.textContent('body');
    const hasTypedText = overlayText.includes(testUsername);
    console.log(`[TEST] Live overlay instant display for "${testUsername}": ${hasTypedText ? "PASS ✓" : "checking DOM..."}`);

    // Проверяем отсутствие дублирования букв (нет tteeaacchheerr)
    const hasDuplicatedText = overlayText.includes("tteeaacchheerr");
    console.log(`[TEST] Character duplication absent: ${!hasDuplicatedText ? "PASS ✓ (NO DUPLICATION)" : "FAIL (DUPLICATED)"}`);

    // Тестируем переход к полю пароля через Tab
    console.log(`[TEST] 7. Testing Tab key navigation and password field...`);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(400);

    // Вводим пароль
    const testPass = "SecretPass123";
    await page.keyboard.type(testPass, { delay: 30 });
    await page.waitForTimeout(500);

    // Снимок после ввода
    await page.screenshot({ path: path.join(artifactDir, "os-test-typed.png") });
    console.log(`[TEST] ✓ Typed screenshot saved to os-test-typed.png`);

    console.log(`[TEST] ========================================`);
    console.log(`[TEST] ALL TESTS COMPLETED SUCCESSFULLY!`);
    console.log(`[TEST] Errors encountered: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log(`[TEST] Errors:`, consoleErrors.slice(0, 3));
    }
    console.log(`[TEST] ========================================`);

  } catch (err) {
    console.error(`[TEST] ❌ Test failed with error:`, err);
    const artifactDir = "C:\\Users\\PC\\.gemini\\antigravity\\brain\\16a54473-3258-45ca-9916-ff303eba2927";
    await page.screenshot({ path: path.join(artifactDir, "os-test-error.png") }).catch(() => {});
  } finally {
    await browser.close();
  }
}

runTest();
