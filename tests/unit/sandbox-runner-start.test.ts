import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Запуск раннера внутри Vercel Sandbox.
 *
 * Здесь жил баг, который невозможно было заметить на локальных тестах: команда
 * запуска убивала сама себя. В `pkill -f 'runner.mjs'` имя процесса стоит
 * буквально в командной строке самого bash, поэтому pkill сносил этот bash,
 * node не стартовал, лог оставался пустым, а учитель видел бесконечное
 * «Запускаю браузер…». Локально это воспроизвести нельзя — там раннер запускает
 * сам тест. Тест ловит сам инвариант, а не симптом.
 */

const runCommand = vi.fn();
const writeFile = vi.fn();
const readFile = vi.fn();
const domain = vi.fn(() => "https://sandbox-3000.example.vercel.run");

vi.mock("@/lib/workspace/runtime", () => ({
  getAccountSandbox: async () => ({
    domain,
    fs: { writeFile, readFile },
    runCommand,
  }),
}));

const USER = "user-1";
process.env.AUTH_SECRET = "test-secret-that-is-definitely-longer-than-32-chars";

// Петля ожидания готовности раннера по умолчанию живёт 45 секунд. Здесь её
// укорачиваем: проверяем логику, а не скорость Vercel Sandbox.
process.env.RUNNER_READY_ATTEMPTS = "2";
process.env.RUNNER_READY_DELAY_MS = "1";

function commandOutput(text: string) {
  return { stdout: async () => text, stderr: async () => "", exitCode: async () => 0 };
}

/** Все команды, которые песочница получила от сервиса. */
function bashCommands(): string[] {
  return runCommand.mock.calls
    .map((call) => call[0] as { cmd: string; args?: string[] })
    .filter((call) => call.cmd === "bash")
    .map((call) => (call.args ?? []).join(" "));
}

describe("запуск раннера в Vercel Sandbox", () => {
  beforeEach(() => {
    vi.resetModules();
    runCommand.mockReset();
    writeFile.mockReset().mockResolvedValue(undefined);
    readFile.mockReset().mockResolvedValue("");
    domain.mockClear();
    runCommand.mockImplementation(async (cmd: { cmd: string }) => {
      if (cmd.cmd === "bash") return commandOutput("READY");
      if (cmd.cmd === "cat") return commandOutput("runner started");
      return commandOutput("");
    });
  });

  it("ни одна команда не убивает сама себя через pkill", async () => {
    // Песочница ещё не отвечает — доходим до запуска.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("нет сети")));
    const { getSandboxBrowserRpcUrl } = await import("@/lib/agents/sandbox-browser-service");

    await expect(getSandboxBrowserRpcUrl(USER)).rejects.toBeTruthy();

    const commands = bashCommands();
    expect(commands.some((c) => c.includes("nohup")), "раннер должен запускаться через nohup").toBe(true);

    // Главный инвариант. `pkill -f` сравнивает шаблон со всей командной
    // строкой процесса, а туда входит и его собственный bash. Совпадение
    // шаблона с текстом самой команды означает, что процесс убивает себя до
    // старта — ровно то, что ломало прод.
    for (const command of commands) {
      for (const pkill of command.matchAll(/pkill -f '([^']+)'/g)) {
        expect(
          new RegExp(pkill[1]).test(command),
          `шаблон pkill ${pkill[1]} совпадает с собственной командой «${command}»: процесс убивает сам себя`,
        ).toBe(false);
      }
    }
  });

  it("старый раннер снимается отдельной командой до запуска нового", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("нет сети")));
    const { getSandboxBrowserRpcUrl } = await import("@/lib/agents/sandbox-browser-service");

    await expect(getSandboxBrowserRpcUrl(USER)).rejects.toBeTruthy();

    const commands = bashCommands();
    const kill = commands.findIndex((c) => c.includes("pkill"));
    const start = commands.findIndex((c) => c.includes("nohup"));
    expect(kill, "старый раннер должен сниматься").toBeGreaterThanOrEqual(0);
    expect(start, "новый раннер должен запускаться").toBeGreaterThan(kill);
    // В одной команде убийство и запуск несовместимы: имя процесса попадёт в
    // собственную командную строку и pkill снесёт сам себя.
    expect(kill).not.toBe(start);
  });

  it("готовый раннер с актуальным секретом берётся сразу и не перезапускается", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { getSandboxBrowserRpcUrl } = await import("@/lib/agents/sandbox-browser-service");
    const { getRunnerRpcSecret } = await import("@/lib/agents/browser-rpc");
    readFile.mockResolvedValue(JSON.stringify({ secret: getRunnerRpcSecret(USER), port: 3000 }));

    const url = await getSandboxBrowserRpcUrl(USER);

    expect(url).toBe("https://sandbox-3000.example.vercel.run/_agent/browser");
    expect(runCommand).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("пишет конфигурацию и скрипт в песочницу перед стартом", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("нет сети")));
    const { getSandboxBrowserRpcUrl } = await import("@/lib/agents/sandbox-browser-service");

    await expect(getSandboxBrowserRpcUrl(USER)).rejects.toBeTruthy();

    const written = writeFile.mock.calls.map((call) => String(call[0]));
    expect(written).toContain("/tmp/runner-config.json");
    expect(written).toContain("/tmp/runner.mjs");
  });

  it("ставит системные библиотеки Chromium, а не только сам Playwright", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("нет сети")));
    const { getSandboxBrowserRpcUrl } = await import("@/lib/agents/sandbox-browser-service");

    await expect(getSandboxBrowserRpcUrl(USER)).rejects.toBeTruthy();

    const script = bashCommands().find((c) => c.includes("pw-ready"));
    expect(script, "раз подготовка должна устанавливать Playwright").toBeTruthy();
    // Образ песочницы приходит с бинарниками Chromium, но без разделяемых
    // библиотек: без них headless-shell падает с libglib-2.0.so.0 not found,
    // и это невозможно увидеть на локальной машине.
    expect(script, "нужны именно системные библиотеки").toContain("install-deps chromium");
    // Установка обязана идти под локом и завершаться маркером: два запроса
    // одновременно запускали бы apt по два раза.
    expect(script).toContain("pw-lock");
    expect(script).toContain("pw-deps-ready");
  });

  it("при недоступном раннере объясняет, что браузер ещё запускается", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("нет сети")));
    const { getSandboxBrowserRpcUrl } = await import("@/lib/agents/sandbox-browser-service");

    await expect(getSandboxBrowserRpcUrl(USER)).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("около минуты"),
    });
  });

  it("раннер со старым (общим) секретом в конфиге перезапускается с персональным", async () => {
    // Раннер жив, но в конфиге лежит чужой секрет — как у песочниц до исправления.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockRejectedValue(new Error("нет сети"));
    vi.stubGlobal("fetch", fetchMock);
    readFile.mockResolvedValue(JSON.stringify({ secret: "runner-secret-shared-by-everyone-0123456789", port: 3000 }));
    const { getSandboxBrowserRpcUrl } = await import("@/lib/agents/sandbox-browser-service");
    const { getRunnerRpcSecret } = await import("@/lib/agents/browser-rpc");

    await expect(getSandboxBrowserRpcUrl(USER)).rejects.toBeTruthy();

    const config = writeFile.mock.calls.find((call) => call[0] === "/tmp/runner-config.json");
    expect(config, "конфиг должен быть перезаписан").toBeTruthy();
    expect(JSON.parse(String(config![1])).secret).toBe(getRunnerRpcSecret(USER));
    expect(bashCommands().some((c) => c.includes("nohup")), "раннер должен быть перезапущен").toBe(true);
  });
});
