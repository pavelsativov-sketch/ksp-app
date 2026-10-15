import { getAccountSandbox } from "@/lib/workspace/runtime";
import { RUNNER_SCRIPT } from "@/lib/agents/sandbox-runner-code";
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

    // 3. Проверяем наличие установленного Playwright
    const checkPw = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", "cd /tmp && node -e \"require('playwright'); process.exit(0);\" 2>/dev/null"],
      timeoutMs: 5000,
    }).catch(() => null);

    if (!checkPw || checkPw.exitCode !== 0) {
      log.info("sandbox-browser: Installing Playwright & Chromium...", { userId });
      await sandbox.runCommand({
        cmd: "bash",
        args: [
          "-lc",
          "cd /tmp && npm init -y >/dev/null 2>&1 && npm i playwright@1.63.0 >/dev/null 2>&1 && npx playwright install chromium >/dev/null 2>&1",
        ],
        timeoutMs: 90_000,
      });
    }

    // 4. Запускаем runner в фоновом режиме на порту 3000
    await sandbox.runCommand({
      cmd: "bash",
      args: [
        "-lc",
        "pkill -f 'runner.mjs' || true; cd /tmp && nohup node /tmp/runner.mjs > /tmp/runner.log 2>&1 &",
      ],
      detached: true,
    });

    // 5. Ожидаем готовности runner'а (до 20 секунд)
    const startTime = Date.now();
    let ready = false;
    while (Date.now() - startTime < 20_000) {
      await new Promise((r) => setTimeout(r, 500));
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
        runnerLog = await logRes.stdout();
      } catch {}
      log.error("sandbox-browser: Runner failed to start", { userId, runnerLog });
      throw new Error(`Браузер в Vercel Sandbox запускается. Пожалуйста, подождите несколько секунд и повторите.`);
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
