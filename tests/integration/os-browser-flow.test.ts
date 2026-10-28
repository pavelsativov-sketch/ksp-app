/**
 * Интеграционная проверка связки «приложение → раннер → Chromium».
 *
 * Поднимает ровно тот раннер, что уезжает в Vercel Sandbox
 * (src/lib/agents/sandbox-runner-code.ts), и прогоняет через него
 * настоящие модули приложения: getAgentBrowserSession → browserRpc → раннер.
 *
 * Ловит именно тот класс поломок, который приходилось чинить руками:
 * рассогласование между приложением и раннером (подпись HMAC, аргументы
 * evaluate, storageState, коды ответов) и появление второго браузера, когда
 * агент и учитель перестают видеть одну сессию. Мок только у Mongo.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const AUTH_SECRET = "integration-secret-definitely-longer-than-32-chars";
// Как в проде: у каждого пользователя свой раннер (своя песочница) со своим
// производным секретом. Общий AUTH_SECRET раннеру больше не годится.
const PORTS: Record<string, number> = {};
const rpcUrlFor = (userId: string) => `http://127.0.0.1:${PORTS[userId]}/_agent/browser`;

/** Что persist кладёт в Mongo — читается обратно тем же шифрованием. */
const stored = new Map<string, string>();

vi.mock("@/lib/mongo", () => ({
  COL: { agentBrowserSessions: "agent_browser_sessions" },
  getDb: async () => ({
    collection: () => ({
      findOne: async ({ user_id }: { user_id: string }) => {
        const encrypted_state = stored.get(user_id);
        return encrypted_state ? { encrypted_state } : null;
      },
      updateOne: async (
        filter: { user_id: string },
        update: { $set: { encrypted_state: string } },
      ) => {
        stored.set(filter.user_id, update.$set.encrypted_state);
        return { acknowledged: true };
      },
      deleteOne: async ({ user_id }: { user_id: string }) => {
        stored.delete(user_id);
        return { deletedCount: 1 };
      },
    }),
  }),
}));

// На Vercel приложение само достаёт адрес раннера из песочницы. Здесь
// песочницу заменяет локальный процесс; всё остальное — настоящее.
vi.mock("@/lib/agents/sandbox-browser-service", () => ({
  getSandboxBrowserRpcUrl: async (userId: string) => rpcUrlFor(userId),
}));

const {
  getAgentBrowserSession,
  persistAgentBrowserSession,
  readStoredBrowserState,
  clearAgentBrowserSession,
} = await import("@/lib/agents/browser-session");

/** Извлекает RUNNER_SCRIPT так же, как scripts/check-runner.mjs. */
function loadRunnerScript(): string {
  const file = path.join(process.cwd(), "src", "lib", "agents", "sandbox-runner-code.ts");
  const source = readFileSync(file, "utf8");
  const marker = "RUNNER_SCRIPT = `";
  const start = source.indexOf(marker);
  if (start === -1) throw new Error("не найдено объявление RUNNER_SCRIPT");
  const body = source.slice(start + marker.length, source.lastIndexOf("`"));
  return new Function(`return \`${body}\`;`)();
}

// Валидный ObjectId (24 hex). Собираем конструктивно: предыдущая версия была
// на символ длиннее и проходила только потому, что Mongo здесь подменена.
const USER = `651f${"0".repeat(18)}aa`;
// Отдельный пользователь для проверки смерти браузера: тест нарочно убивает
// сессию, и общую трогать нельзя.
const USER_CRASH = `651f${"0".repeat(18)}bb`;
const runners: Array<ReturnType<typeof spawn>> = [];
PORTS[USER] = 3211;
PORTS[USER_CRASH] = 3212;

/**
 * Chromium может быть не установлен (`npx playwright install chromium`).
 * Пропускаем набор с громким предупреждением, а не падаем: в CI браузер
 * ставится отдельным шагом, так что там проверка реально выполняется.
 */
const chromiumAvailable = await (async () => {
  try {
    const { chromium } = await import("playwright");
    const probe = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    await probe.close();
    return true;
  } catch {
    return false;
  }
})();

if (!chromiumAvailable) {
  console.warn(
    "[os-browser-flow] Chromium не найден — интеграционная проверка ОС пропущена.\n" +
      "  Установите браузер: npx playwright install chromium",
  );
}

beforeAll(async () => {
  process.env.AUTH_SECRET = AUTH_SECRET;
  process.env.VERCEL = "1";

  const dir = path.join(process.cwd(), "node_modules", ".cache", "mekty-runner-it");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "runner.mjs");
  writeFileSync(file, loadRunnerScript(), "utf8");

  const { getRunnerRpcSecret } = await import("@/lib/agents/browser-rpc");
  for (const user of [USER, USER_CRASH]) {
    const port = PORTS[user]!;
    const child = spawn(process.execPath, [file], {
      env: { ...process.env, PORT: String(port), AUTH_SECRET, BROWSER_RPC_SECRET: getRunnerRpcSecret(user) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stderr?.on("data", () => {});
    runners.push(child);
  }

  for (const user of [USER, USER_CRASH]) {
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      try {
        ready = (await fetch(`http://127.0.0.1:${PORTS[user]}/health`)).ok;
      } catch { /* раннер ещё поднимается */ }
      if (!ready) await sleep(500);
    }
    if (!ready) throw new Error("раннер не поднялся");
  }
}, 60_000);

afterAll(() => {
  for (const child of runners) child.kill();
});

describe.skipIf(!chromiumAvailable)("ОС: сессия браузера", () => {
  it("создаёт сессию и отдаёт кадр", async () => {
    const session = await getAgentBrowserSession(USER);

    expect(session.remote).toBeDefined();
    expect(session.page.isClosed()).toBe(false);

    const frame = await session.remote!.performUiAction("screenshot", {});
    expect(frame.screenshot.length).toBeGreaterThan(1000);
    expect(frame.currentUrl).toBe("about:blank");
  }, 60_000);

  it("переходит на страницу и читает заголовок", async () => {
    const session = await getAgentBrowserSession(USER);

    await session.page.goto("https://example.com", { timeout: 20_000 });
    expect(session.page.url()).toContain("example.com");

    // title() отправляет отдельное действие раннеру; без него приходил null
    expect(await session.page.title()).toBe("Example Domain");
  }, 60_000);

  it("разведка элемента получает аргумент", async () => {
    const session = await getAgentBrowserSession(USER);
    const { probeElement } = await import("@/lib/agents/computer/screen");

    const probe = await probeElement(session.page as never, 10, 10);

    // Без проброса аргумента раннер вернул бы функцию вместо тега
    expect(probe.tag).toBe("html");
  }, 60_000);

  it("собирает интерактивные элементы для агента", async () => {
    const session = await getAgentBrowserSession(USER);
    const { readInteractables } = await import("@/lib/agents/computer/screen");

    const list = await readInteractables(session.page as never);

    // Формат строки: "[0] ссылка (500,944) Learn more" — индекс, вид и
    // нормализованные координаты, по которым агент кликает.
    expect(list).toMatch(/^\[\d+\] (ссылка|кнопка|поле) \(\d+,\d+\) .+/);
  }, 60_000);

  it("клавиатура, колесо и drag доходят до страницы", async () => {
    const session = await getAgentBrowserSession(USER);
    await session.page.goto("https://example.com", { timeout: 20_000 });

    await session.page.keyboard.press("End");
    await session.page.mouse.wheel(0, 120);
    // drag использует mouseDown/mouseUp — таких действий в раннере не было
    await session.page.mouse.down();
    await session.page.mouse.up();

    expect(await session.page.evaluate(() => document.readyState)).toBe("complete");
  }, 60_000);

  it("передаёт вид кнопки мыши (правый клик Computer-Use)", async () => {
    const session = await getAgentBrowserSession(USER);
    await session.page.goto("https://example.com", { timeout: 20_000 });
    await session.page.evaluate(() => {
      const w = window as unknown as { __lastButton?: string };
      document.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        w.__lastButton = "right";
      });
    });

    // Раньше button не уходил в раннер, и правый клик становился левым
    await session.page.mouse.click(400, 400, { button: "right", clickCount: 1 });
    await sleep(500);

    const seen = await session.page.evaluate(() =>
      (window as unknown as { __lastButton?: string }).__lastButton);
    expect(seen).toBe("right");
  }, 60_000);

  it("сохраняет id сессии, чтобы не терять вход после рестарта", async () => {
    const session = await getAgentBrowserSession(USER);
    await session.page.goto("https://example.com", { timeout: 20_000 });

    await persistAgentBrowserSession(USER);
    expect(stored.get(USER)).toBeTruthy();

    // Читаем документ так же, как это делает процесс после перезапуска.
    const restored = await readStoredBrowserState(USER);

    // Раньше persist клал в документ только currentUrl: storageState не
    // доезжал, и readStoredState отдавал undefined — sessionId терялся, и
    // каждая новая лямбда открывала свежий браузер без авторизации.
    expect(restored?.sessionId).toBe(session.remote!.sessionId);
    expect(restored?.currentUrl).toContain("example.com");
  }, 60_000);

  it("вычищает сеанс по кнопке учителя", async () => {
    await clearAgentBrowserSession(USER);
    expect(stored.has(USER)).toBe(false);
  }, 60_000);
});

describe.skipIf(!chromiumAvailable)("ОС: пароль учителя не утекает", () => {
  /** Ставит в страницу форму входа и фокусирует нужное поле. */
  async function openLoginAndFocus(
    session: Awaited<ReturnType<typeof getAgentBrowserSession>>,
    field: "login" | "password",
  ) {
    await session.page.evaluate((which: string) => {
      document.body.innerHTML = `
        <label>Логин <input name="login" style="padding:8px"></label>
        <label>Пароль <input name="password" type="password" style="padding:8px"></label>
      `;
      const target = document.querySelector(which === "password" ? 'input[type="password"]' : 'input[name="login"]') as HTMLInputElement | null;
      target?.focus();
    }, field);
  }

  it("разведка поля пароля отдаёт точки, а не сам пароль", async () => {
    const { inspectActiveField } = await import("@/lib/agents/browser-dom");
    const session = await getAgentBrowserSession(USER);

    await openLoginAndFocus(session, "password");
    await session.remote!.performUiAction("type", { text: "DemoPass-2026" });
    await session.page.waitForTimeout(500);

    const field = await inspectActiveField(session.page);

    // Поле должно оказаться тем самым паролем — иначе тест ничего не проверяет.
    expect(field.isPassword, "нужно попасть в поле пароля").toBe(true);
    // Разведка уезжает учителю в заголовке X-Active-Field, то есть в
    // состояние React и в журнал сети. Открытым текстом там быть не должно.
    expect(field.value ?? "", "пароль утекает в разведке").not.toContain("DemoPass");
    expect(field.value).toBe("•".repeat("DemoPass-2026".length));
  }, 90_000);

  it("логин при этом остаётся читаемым", async () => {
    const { inspectActiveField } = await import("@/lib/agents/browser-dom");
    const session = await getAgentBrowserSession(USER);

    await openLoginAndFocus(session, "login");
    await session.remote!.performUiAction("type", { text: "teacher_ivanov" });
    await session.page.waitForTimeout(500);

    const field = await inspectActiveField(session.page);

    // Маскируется только пароль: логин интерфейс показывает честно.
    expect(field.isPassword).toBe(false);
    expect(field.value).toBe("teacher_ivanov");
  }, 90_000);

  it("после смерти браузера сессия честно просит переподключиться", async () => {
    const session = await getAgentBrowserSession(USER_CRASH);

    // Убиваем контекст — так же, как это делает упавший Chromium.
    await session.context.close().catch(() => {});

    // Держать мёртвую сессию нельзя: каждое следующее действие падало бы так
    // же, и вкладка учителя оставалась бы сломанной навсегда. Раннер должен
    // убрать сессию и ответить 410 — этот код вся система читает как «сеанс
    // завершён, создай новый».
    await expect(session.remote!.performUiAction("type", { text: "a" }))
      .rejects.toMatchObject({ status: 410 });

    // И новый сеанс после этого обязан работать.
    const fresh = await getAgentBrowserSession(USER_CRASH);
    const frame = await fresh.remote!.performUiAction("screenshot", {});
    expect(frame.screenshot.length).toBeGreaterThan(1000);
  }, 90_000);
});

describe.skipIf(!chromiumAvailable)("ОС: агент и учитель в одной сессии", () => {
  it("действие агента видно в сессии учителя", async () => {
    const { browserTools } = await import("@/lib/agents/tools/browser");
    const teacher = await getAgentBrowserSession(USER);

    const result = await browserTools.browserNavigate(
      { url: "https://example.com" },
      { userId: USER },
    ) as { success?: boolean; title?: string; interactables?: string; error?: string };

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.title).toBe("Example Domain");
    expect(result.interactables).toMatch(/\(\d+,\d+\)/);

    // Ключевое свойство: агент и вкладка «Браузер» — один и тот же браузер.
    // Пока в проекте жил второй backend (Vercel Sandbox + Codespaces), это
    // было ложно: агент кликал в невидимый Chromium.
    expect(teacher.page.url()).toContain("example.com");
    expect(teacher.remote!.sessionId).toBeTruthy();
  }, 90_000);

  it("переход учителя виден агенту", async () => {
    const { browserTools } = await import("@/lib/agents/tools/browser");
    const teacher = await getAgentBrowserSession(USER);

    await teacher.page.goto("https://example.com", { timeout: 20_000 });

    const result = await browserTools.browserNavigate(
      { url: "https://example.com" },
      { userId: USER },
    ) as { success?: boolean; url?: string };

    expect(result.success).toBe(true);
    expect(result.url).toContain("example.com");
  }, 90_000);
});