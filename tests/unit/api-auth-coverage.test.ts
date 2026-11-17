import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findRouteFiles(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

/**
 * Явный реестр публичных или системно-защищённых маршрутов, которым НЕ нужен пользовательский сессионный вход.
 * Любой новый /api/... маршрут без проверки авторизации упадёт на этом тесте.
 */
const EXPLICIT_NON_SESSION_ROUTES = new Set([
  // Публичное прохождение выданного учителем ДЗ по коду (/a/[code])
  "src/app/api/assignments/code/[code]/route.ts",
  "src/app/api/assignments/code/[code]/submit/route.ts",
  // Справочник целей ГОСО и healthcheck
  "src/app/api/objectives/route.ts",
  "src/app/api/health/route.ts",
  // Публичная форма заявок на покупку Pro / подключение школы / поддержку (защищена IP rate-limit + honeypot)
  "src/app/api/leads/route.ts",
  // Внутренний вызов продолжения задачи агента (защищён HMAC verifyContinuation)
  "src/app/api/agents/task/continue/route.ts",
  // Выведенный из эксплуатации маршрут демо-наполнения (всегда отдаёт 410)
  "src/app/api/school/[id]/seed/route.ts",
]);

const AUTH_PATTERNS = [
  /\brequireApiAuth\b/,
  /\bwithApiAuth\b/,
  /\brequireAdmin\b/,
  /\badminJson\b/,
  /\bgetCurrentUser\b/,
];

describe("API route authentication coverage", () => {
  it("enforces authentication on every non-public API route", () => {
    const root = join(process.cwd(), "src", "app", "api");
    const files = findRouteFiles(root);
    expect(files.length).toBeGreaterThan(40);

    const unprotected: string[] = [];
    for (const fullPath of files) {
      const rel = fullPath.slice(process.cwd().length + 1).replace(/\\/g, "/");
      if (EXPLICIT_NON_SESSION_ROUTES.has(rel)) continue;
      // Маршруты самого входа/регистрации/сброса пароля и публичного квиза/библиотеки
      if (rel.startsWith("src/app/api/auth/")) continue;

      const source = readFileSync(fullPath, "utf8");
      const hasAuth = AUTH_PATTERNS.some((re) => re.test(source));
      if (!hasAuth) {
        unprotected.push(rel);
      }
    }

    expect(
      unprotected,
      `Найдены API-маршруты без проверки авторизации: ${unprotected.join(", ")}`,
    ).toEqual([]);
  });
});
