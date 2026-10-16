import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      // Поднимает настоящий Chromium и гоняет ОС end-to-end (~$10 с).
      // Ловит рассогласование между приложением и браузерным раннером.
      "tests/integration/**/*.test.ts",
    ],
    exclude: ["node_modules", ".next", "tests/e2e/**"],
    globals: false,
    pool: "forks",
    coverage: {
      provider: "v8",
      // Порог держит планку: без него покрытие незаметно падает вместе с
      // рефакторингом. Ориентир — бизнес-логика в src/lib.
      include: ["src/lib/**/*.ts", "src/app/api/**/route.ts"],
      exclude: ["**/*.test.ts", "src/lib/**/server-only*"],
      thresholds: {
        statements: 40,
        lines: 40,
      },
      reporter: ["text-summary", "json-summary"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Заглушка для серверных модулей: в Vitest нет Next.js-бандлера,
      // который реализует пакет `server-only`.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
