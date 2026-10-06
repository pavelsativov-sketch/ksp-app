import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke E2E. По умолчанию поднимает `npm run dev` (Supabase можно не настраивать —
 * лендинг и статика отрендерятся, страницы под аутентификацией редиректят на /).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
