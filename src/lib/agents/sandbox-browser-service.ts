import { getAccountSandbox } from "@/lib/workspace/runtime";
import { RUNNER_SCRIPT } from "@/lib/agents/sandbox-runner-code";
import { BrowserRpcError, getRunnerRpcSecret } from "@/lib/agents/browser-rpc";
import { log } from "@/lib/logger";

interface RunnerCacheEntry {
  url: string;
  verifiedAt: number;
}

const runnerCache = new Map<string, RunnerCacheEntry>();
const openingLocks = new Map<string, Promise<string>>();

/**
 * Сколько ждём готовности раннера и с какой паузой.
 *
 * Раньше это была жёсткая пеття на 45 секунд. Через окружение её можно
 * укоротить в тестах (иначе каждый прогон платит реальную минуту) и подкрутить
 * на развёртывании, не правя код.
 */
const readyAttempts = Number(process.env.RUNNER_READY_ATTEMPTS ?? 45);
const readyDelayMs = Number(process.env.RUNNER_READY_DELAY_MS ?? 1_000);

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
      // Раннер, поднятый старой версией, мог получить общий BROWSER_RPC_SECRET.
      // Сверяем секрет в конфиге песочницы с персональным и, если он другой,
      // идём дальше: конфиг перезапишется, раннер перезапустится.
      const expectedSecret = getRunnerRpcSecret(userId);
      const currentConfig = await sandbox.fs.readFile("/tmp/runner-config.json", "utf8").catch(() => "");
      if (currentConfig.includes(JSON.stringify(expectedSecret))) {
        runnerCache.set(userId, { url: domainUrl, verifiedAt: now });
        return `${domainUrl}/_agent/browser`;
      }
      log.warn("sandbox-browser: секрет раннера устарел, перезапускаем", { userId });
    }

    log.info("sandbox-browser: Starting browser runner inside Vercel Sandbox...", { userId });

    // 2. Записываем конфигурацию и скрипт runner'а
    // Секрет — производный от AUTH_SECRET на пользователя (см. getRunnerRpcSecret):
    // в песочницу не попадает глобальный секрет приложения.
    const secret = getRunnerRpcSecret(userId);
    await sandbox.fs.writeFile(
      "/tmp/runner-config.json",
      JSON.stringify({ secret, port: 3000 }),
      "utf8",
    );
    await sandbox.fs.writeFile("/tmp/runner.mjs", RUNNER_SCRIPT, "utf8");

    // 3. Готовим песочницу: Playwright, Chromium и системные библиотеки.
// Установка идёт под атомарным mkdir-локом прямо в песочнице: без него
// два параллельных запроса (например, keepalive и первое действие
// учителя) запускали установку в один /tmp и портили node_modules.
//
// Отдельно нужны системные библиотеки. Образ vercel/sandbox/universal
// приходит с готовыми бинарниками Chromium, но без разделяемых библиотек:
// headless-shell падает с «libglib-2.0.so.0: cannot open shared object file».
// На локальной машине и в обычном контейнере этого не видно — там библиотеки
// есть всегда, и браузер на проде просто молча не запускается.
const INSTALL_SCRIPT = `
set -u
READY=/tmp/pw-ready
DEPS=/tmp/pw-deps-ready
FONTS=/tmp/pw-fonts-ready
LOCK=/tmp/pw-lock
LOG=/tmp/pw-install.log

# sudo в песочнице работает без пароля, но если образ когда-то сменится и
# команды уже будут под root — не сломаемся из-за лишнего sudo.
if sudo -n true 2>/dev/null; then SUDO="sudo -n"; else SUDO=""; fi

# Песочницы, поднятые до появления маркеров, уже всё имеют.
if [ ! -f "$READY" ] && [ -d /tmp/node_modules/playwright ]; then touch "$READY"; fi
if [ ! -f "$DEPS" ] && ldconfig -p 2>/dev/null | grep -q libglib-2.0; then touch "$DEPS"; fi

if mkdir "$LOCK" 2>/dev/null; then
  cd /tmp
  if [ ! -f "$READY" ]; then
    npm init -y >"$LOG" 2>&1
    npm i playwright@1.64.1 >>"$LOG" 2>&1
    npx playwright install chromium >>"$LOG" 2>&1
    if [ -d /tmp/node_modules/playwright ]; then touch "$READY"; fi
  fi
  if [ ! -f "$DEPS" ] && [ -f "$READY" ]; then
    $SUDO npx playwright install-deps chromium >>"$LOG" 2>&1
    if ldconfig -p 2>/dev/null | grep -q libglib-2.0; then touch "$DEPS"; fi
  fi
  # Шрифты. Образ песочницы приходит без них, и Chromium рисует кириллицу и
  # казахские буквы (ә ғ қ ң ө ұ ү һ і) пустыми «квадратиками» — учитель видит
  # «иероглифы» вместо текста страницы. Noto Sans покрывает латиницу и всю
  # кириллицу, включая казахские буквы. Шаг необязательный: при сбое сети
  # браузер всё равно работает, а установка повторится при следующем запуске.
  if [ ! -f "$FONTS" ]; then
    mkdir -p "$HOME/.fonts"
    for f in NotoSans-Regular NotoSans-Bold NotoSans-Italic NotoSans-BoldItalic; do
      [ -s "$HOME/.fonts/$f.ttf" ] || curl -fsSL --max-time 60 -o "$HOME/.fonts/$f.ttf"         "https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSans/hinted/ttf/$f.ttf" >>"$LOG" 2>&1 || rm -f "$HOME/.fonts/$f.ttf"
    done
    command -v fc-cache >/dev/null 2>&1 && fc-cache -f >>"$LOG" 2>&1
    if [ -s "$HOME/.fonts/NotoSans-Regular.ttf" ]; then touch "$FONTS"; fi
  fi
  rmdir "$LOCK" 2>/dev/null
else
  # Уже готовит другой процесс — ждём его маркеры.
  for i in $(seq 1 150); do
    [ -f "$READY" ] && [ -f "$DEPS" ] && break
    sleep 2
  done
fi
if [ -f "$READY" ] && [ -f "$DEPS" ]; then echo READY; else echo NOT_READY; fi
`;

    const install = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", INSTALL_SCRIPT],
      timeoutMs: 420_000,
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

    // 4. Снимаем старый раннер и запускаем новый — ДВУМЯ командами.
    //
    // Разносить пришлось из-за очень неприятной ошибки. `pkill -f` ищет
    // совпадение по всей командной строке процесса — включая его собственный
    // bash. Если команда запуска содержит и `pkill`, и `node /tmp/runner.mjs`
    // (а она содержит оба), то pkill убивает тот самый bash, который должен
    // запустить node: раннер не стартует, /tmp/runner.log остаётся пустым, а
    // учитель минутами смотрит на «Запускаю браузер…». На локальных тестах это
    // не воспроизводится — там раннер запускает сам тест.
    //
    // В команде убийства имя процесса пишется как `[r]unner.mjs`: регулярное
    // выражение `[r]unner.mjs` совпадает с «runner.mjs», но не совпадает с
    // текстом `[r]unner.mjs` в собственной командной строке.
    await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", "pkill -f 'node /tmp/[r]unner.mjs' >/dev/null 2>&1 || true"],
      detached: true,
    });
    await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", "cd /tmp && LANG=C.UTF-8 LC_ALL=C.UTF-8 nohup node /tmp/runner.mjs > /tmp/runner.log 2>&1 &"],
      detached: true,
    });

    // 5. Ожидаем готовности runner'а. Chromium раннер поднимает сам при старте,
// поэтому ждать приходится только Node-процесс. Первый запуск песочницы
// (установка Playwright) занимает минуты — про это честно пишем в ошибке.
    const startTime = Date.now();
    let ready = false;
    for (let attempt = 0; attempt < readyAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, readyDelayMs));
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
    log.info("sandbox-browser: runner readiness wait finished", {
      userId,
      ready,
      waitedMs: Date.now() - startTime,
    });

    if (!ready) {
      // Собираем всё, что поможет разобраться без догадок: лог раннера, жив ли
      // процесс и есть ли вообще node в песочнице. Пустой лог при живом node —
      // значит процесс не запускался вовсе.
      let runnerLog = "";
      let processState = "";
      try {
        const diag = await sandbox.runCommand({
          cmd: "bash",
          args: [
            "-lc",
            "echo NODE=$(command -v node || echo none); echo ALIVE=$(pgrep -f '[r]unner.mjs' | tr '\\n' ' '); echo LISTEN=$( (command -v ss >/dev/null && ss -ltn || netstat -ltn) 2>/dev/null | grep -c 3000 )",
          ],
          timeoutMs: 5000,
        });
        processState = (await diag.stdout()).replace(/\s+/g, " ").trim().slice(0, 200);
      } catch {}
      try {
        const logRes = await sandbox.runCommand({ cmd: "cat", args: ["/tmp/runner.log"], timeoutMs: 3000 });
        runnerLog = (await logRes.stdout()).slice(-800);
      } catch {}
      log.error("sandbox-browser: Runner failed to start", { userId, runnerLog, processState });
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
