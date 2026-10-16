import { getAccountSandbox } from "@/lib/workspace/runtime";
import { RUNNER_SCRIPT } from "@/lib/agents/sandbox-runner-code";
import { BrowserRpcError } from "@/lib/agents/browser-rpc";
import { log } from "@/lib/logger";

interface RunnerCacheEntry {
  url: string;
  verifiedAt: number;
}

const runnerCache = new Map<string, RunnerCacheEntry>();
const openingLocks = new Map<string, Promise<string>>();

/**
 * Обеспечивает запуск и доступность автономного браузерного раннера внутри Vercel Sandbox.
 * Возвращает прямой HTTPS RPC URL (на домене *.vercel.run).
 */
export async function getSandboxBrowserRpcUrl(userId: string): Promise<string> {
  const existing = openingLocks.get(userId);
  if (existing) return existing;

  const promise = (async () => {
    const now = Date.now();
    const cached = runnerCache.get(userId);
    if (cached && now - cached.verifiedAt < 60_000) {
      const alive = await fetch(`${cached.url}/health`, {
        signal: AbortSignal.timeout(1500),
        cache: "no-store",
      })
        .then((r) => r.ok)
        .catch(() => false);
      if (alive) {
        cached.verifiedAt = now;
        return `${cached.url}/_agent/browser`;
      }
      runnerCache.delete(userId);
    }

    const sandbox = await getAccountSandbox(userId);
    const domainUrl = sandbox.domain(3000);

    // 1. Проверяем, отвечает ли уже запущенный runner
    const alive = await fetch(`${domainUrl}/health`, {
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    })
      .then((r) => r.ok)
      .catch(() => false);

    if (alive) {
      runnerCache.set(userId, { url: domainUrl, verifiedAt: now });
      return `${domainUrl}/_agent/browser`;
    }

    log.info("sandbox-browser: Starting browser runner inside Vercel Sandbox...", { userId });

    // 2. Записываем конфигурацию и скрипт runner'а
    const secret = process.env.AUTH_SECRET;
    await sandbox.fs.writeFile(
      "/tmp/runner-config.json",
      JSON.stringify({ secret, port: 3000 }),
      "utf8",
    );
    await sandbox.fs.writeFile("/tmp/runner.mjs", RUNNER_SCRIPT, "utf8");

    // 3. Устанавливаем Playwright + Chromium ровно один раз на песочницу.
    // Установка идёт под атомарным mkdir-локом прямо в песочнице: без него
    // два параллельных запроса (например, keepalive и первое действие
    // учителя) запускали `npm i` в один /tmp и портили node_modules.
    const INSTALL_SCRIPT = `
set -u
READY=/tmp/pw-ready
LOCK=/tmp/pw-lock
# Песочницы, поднятые до появления маркера, уже имеют Playwright —
# не заставляем их переустанавливать Chromium заново.
if [ ! -f "$READY" ] && [ -d /tmp/node_modules/playwright ]; then touch "$READY"; fi
if [ ! -f "$READY" ]; then
  if mkdir "$LOCK" 2>/dev/null; then
    cd /tmp
    npm init -y >/dev/null 2>&1
    npm i playwright@1.63.0 >/tmp/pw-install.log 2>&1
    npx playwright install chromium >>/tmp/pw-install.log 2>&1
    if [ -d /tmp/node_modules/playwright ]; then touch "$READY"; fi
    rmdir "$LOCK" 2>/dev/null
  else
    # Уже устанавливает другой процесс — ждём его маркер.
    for i in $(seq 1 90); do
      [ -f "$READY" ] && break
      sleep 2
    done
  fi
fi
[ -f "$READY" ] && echo READY || echo NOT_READY
`;

    const install = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", INSTALL_SCRIPT],
      timeoutMs: 200_000,
    }).catch(() => null);

    if (!install || !(await install.stdout()).includes("READY")) {
      let installLog = "";
      try {
        const logRes = await sandbox.runCommand({ cmd: "tail", args: ["-n", "40", "/tmp/pw-install.log"], timeoutMs: 5000 });
        installLog = (await logRes.stdout()).slice(-800);
      } catch {}
      log.error("sandbox-browser: Playwright install failed", { userId, installLog });
      throw new Error("Браузер рабочей области не установился. Обратитесь к администратору.");
    }

    // 4. Запускаем runner в фоновом режиме на порту 3000. `pkill` бьёт
    // только по нашим процессам и не трогает lock-файл установки.
    await sandbox.runCommand({
      cmd: "bash",
      args: [
        "-lc",
        "pkill -f 'runner.mjs' >/dev/null 2>&1 || true; cd /tmp && nohup node /tmp/runner.mjs > /tmp/runner.log 2>&1 &",
      ],
      detached: true,
    });

    // 5. Ожидаем готовности runner'а. Chromium раннер поднимает сам при старте,
// поэтому ждать приходится только Node-процесс. Первый запуск песочницы
// (установка Playwright) занимает минуты — про это честно пишем в ошибке.
    const startTime = Date.now();
    let ready = false;
    while (Date.now() - startTime < 45_000) {
      await new Promise((r) => setTimeout(r, 1000));
      const ok = await fetch(`${domainUrl}/health`, {
        signal: AbortSignal.timeout(1500),
        cache: "no-store",
      })
        .then((r) => r.ok)
        .catch(() => false);
      if (ok) {
        ready = true;
        break;
      }
    }

    if (!ready) {
      let runnerLog = "";
      try {
        const logRes = await sandbox.runCommand({ cmd: "cat", args: ["/tmp/runner.log"], timeoutMs: 3000 });
        runnerLog = (await logRes.stdout()).slice(-800);
      } catch {}
      log.error("sandbox-browser: Runner failed to start", { userId, runnerLog });
      throw new BrowserRpcError(
        "Браузер рабочей области запускается. Это занимает около минуты — соединение повторится автоматически.",
        503,
      );
    }

    log.info("sandbox-browser: Runner is ready and listening!", { userId, domainUrl });
    runnerCache.set(userId, { url: domainUrl, verifiedAt: Date.now() });
    return `${domainUrl}/_agent/browser`;
  })();

  openingLocks.set(userId, promise);
  try {
    return await promise;
  } finally {
    openingLocks.delete(userId);
  }
}
