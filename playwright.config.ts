import { defineConfig, devices } from "@playwright/test";

/**
 * E2E автотесты интерфейса.
 *
 * Сервер поднимается сам. По умолчанию — `npm run dev`, но в этой среде
 * `next dev` не гидратирует страницы (падает HMR-сокет), поэтому для
 * проверок задаётся PROD=1: собранное приложение работает корректно.
 *
 * Учётные данные тестовых учителей создаёт scripts/seed-test-accounts.mjs.
 * Пока их нет, сценарии падают с понятным сообщением — молча пропускать их
 * нельзя, «зелёный» прогон без единого теста вводит в заблуждение.
 *
 * Запуск:
 *   npm run build && npx cross-env PROD=1 npm run test:e2e
 * или
 *   node scripts/seed-test-accounts.mjs && npm run test:e2e
 */
const useProductionServer = process.env.PROD === "1";
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  // Сценарии идут последовательно и делят одну Mongo: параллельная запись
  // в архив тестовых учителей даёт нестабильные результаты.
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "ru-RU",
  },
  webServer: {
    command: useProductionServer ? "npm start" : "npm run dev",
    url: "http://localhost:3000",
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    // Вход один раз на прогон: сервер разрешает 10 входов на почту за 15 минут,
    // и при входе из каждого теста прогон упирался в этот лимит.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth.json" },
      dependencies: ["setup"],
    },
    // Узкий экран: проверяется, что чат, статус и материалы остаются
    // доступными, а среда не прячется целиком.
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], storageState: "tests/e2e/.auth.json" },
      dependencies: ["setup"],
    },
  ],
});
