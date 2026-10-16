import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * «Живые» тесты: реальные AI-провайдеры и реальный браузер.
 *
 * Они тратят квоту и время, поэтому вынесены из обычного `npm test` (и из CI).
 * Запуск: npm run test:agent
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/live/**/*.test.ts"],
    globals: false,
    pool: "forks",
    testTimeout: 300_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});