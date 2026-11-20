import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function findFiles(dir: string, predicate: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findFiles(full, predicate));
    else if (predicate(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Явный реестр публичных или системно-защищённых обработчиков (`METHOD path`), которым НЕ нужна пользовательская сессия.
 * Любой новый обработчик (даже GET в файле, где POST уже защищён!) без явной проверки авторизации упадёт здесь.
 */
const EXPLICIT_NON_SESSION_HANDLERS = new Set([
  // Публичное прохождение выданного учителем ДЗ по коду (/a/[code])
  "GET src/app/api/assignments/code/[code]/route.ts",
  "POST src/app/api/assignments/code/[code]/submit/route.ts",
  // Справочник целей ГОСО и healthcheck
  "GET src/app/api/objectives/route.ts",
  "GET src/app/api/health/route.ts",
  // Публичная форма заявок на покупку Pro / подключение школы / поддержку (IP rate-limit + honeypot)
  "POST src/app/api/leads/route.ts",
  // Публичный опрос комнаты live-квиза учениками (IP + room rate-limit)
  "GET src/app/api/quiz/[code]/route.ts",
  // Внутренний вызов продолжения задачи агента (защищён HMAC verifyContinuation)
  "POST src/app/api/agents/task/continue/route.ts",
  // Выведенный из эксплуатации маршрут демо-наполнения (всегда отдаёт 410)
  "POST src/app/api/school/[id]/seed/route.ts",
]);

const AUTH_PATTERNS = [
  /\brequireApiAuth\b/,
  /\bwithApiAuth\b/,
  /\brequireAdmin\b/,
  /\badminJson\b/,
  /\bgetCurrentUser\b/,
  /\bauthorize\(/,
];

describe("API route & Server Action authentication coverage", () => {
  it("enforces authentication on every individual non-public HTTP method handler", () => {
    const root = join(process.cwd(), "src", "app", "api");
    const files = findFiles(root, (n) => n === "route.ts");
    expect(files.length).toBeGreaterThan(40);

    const unprotected: string[] = [];
    for (const fullPath of files) {
      const rel = fullPath.slice(process.cwd().length + 1).replace(/\\/g, "/");
      if (rel.startsWith("src/app/api/auth/")) continue;

      const source = readFileSync(fullPath, "utf8");
      const handlers = [
        ...source.matchAll(
          /export\s+(?:(?:async\s+)?function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g,
        ),
      ];
      expect(handlers.length, `Файл маршрута без HTTP-обработчиков: ${rel}`).toBeGreaterThan(0);

      for (let i = 0; i < handlers.length; i += 1) {
        const method = handlers[i]![1]!;
        const key = `${method} ${rel}`;
        if (EXPLICIT_NON_SESSION_HANDLERS.has(key)) continue;

        const start = handlers[i]!.index!;
        const end = i + 1 < handlers.length ? handlers[i + 1]!.index! : source.length;
        const body = source.slice(start, end);
        const hasAuth = AUTH_PATTERNS.some((re) => re.test(body));
        if (!hasAuth) {
          unprotected.push(key);
        }
      }
    }

    expect(
      unprotected,
      `Найдены API-обработчики без проверки авторизации: ${unprotected.join(", ")}`,
    ).toEqual([]);
  });

  it("forbids 'use server' action files from exporting raw userId-parameterized read helpers", () => {
    const actionsDir = join(process.cwd(), "src", "app", "actions");
    const files = findFiles(actionsDir, (n) => n.endsWith(".ts"));
    const leaky: string[] = [];
    for (const fullPath of files) {
      const rel = fullPath.slice(process.cwd().length + 1).replace(/\\/g, "/");
      const source = readFileSync(fullPath, "utf8");
      if (!/["']use server["']/.test(source)) continue;
      for (const m of source.matchAll(/export\s+async\s+function\s+(\w+)\s*\(([^)]*)\)/g)) {
        const fnName = m[1]!;
        const params = m[2]!;
        if (/\buserId\b/.test(params)) {
          leaky.push(`${rel}:${fnName}(${params.trim()})`);
        }
      }
    }
    expect(leaky, `Server Actions не должны принимать произвольный userId извне: ${leaky.join(", ")}`).toEqual([]);
  });
});
