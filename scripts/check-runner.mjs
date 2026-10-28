/**
 * Живая проверка браузерного раннера рабочей области ОС.
 *
 * Поднимает ТОТ САМЫЙ раннер, который едет в Vercel Sandbox
 * (`src/lib/agents/sandbox-runner-code.ts`), и прогоняет через него
 * действия, которые реально шлёт приложение. Раньше скрипт проверял
 * отдельную копию `scripts/browser-runner-node.mjs`, которая нигде не
 * запускалась — проверка проходила, а production-код оставался непроверенным.
 *
 * Запуск:  node scripts/check-runner.mjs
 */
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * Достаём RUNNER_SCRIPT из TypeScript-модуля, не импортируя его: иначе Node
 * требует --experimental-strip-types и предупреждает о модуле без
 * "type": "module". Экранирование шаблонной строки вычисляем тем же движком,
 * что и компилятор, — иначе в раннер попадут литеральные `\`` и `\${`.
 */
function loadRunnerScript() {
  const file = path.join(process.cwd(), "src", "lib", "agents", "sandbox-runner-code.ts");
  const source = readFileSync(file, "utf8");
  const marker = "RUNNER_SCRIPT = `";
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`в ${file} не найдено объявление RUNNER_SCRIPT`);
  const body = source.slice(start + marker.length, source.lastIndexOf("`"));
  const script = new Function(`return \`${body}\`;`)();
  if (!script.includes("server.listen") || !script.includes("verifySignature")) {
    throw new Error("извлечённый раннер выглядит неполным — проверьте sandbox-runner-code.ts");
  }
  return script;
}

const SECRET = process.env.AUTH_SECRET || crypto.randomBytes(24).toString("hex");
const PORT = process.env.RUNNER_PORT || "3111";
const URL_BASE = `http://127.0.0.1:${PORT}`;

async function rpc(body) {
  const raw = JSON.stringify(body);
  const ts = String(Date.now());
  const sig = crypto.createHmac("sha256", Buffer.from(SECRET)).update(`${ts}.${raw}`).digest("base64url");
  const res = await fetch(`${URL_BASE}/_agent/browser`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mekty-timestamp": ts, "x-mekty-signature": sig },
    body: raw,
  });
  const type = res.headers.get("content-type") || "";
  if (type.startsWith("image/")) return { image: true, bytes: (await res.arrayBuffer()).byteLength };
  return res.json();
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// Файл кладём внутрь node_modules: раннер импортирует `playwright`, и Node
// должен найти его, поднимаясь по node_modules вверх от расположения файла.
const runnerDir = path.join(process.cwd(), "node_modules", ".cache", "mekty-runner");
mkdirSync(runnerDir, { recursive: true });
const runnerFile = path.join(runnerDir, "runner.mjs");
writeFileSync(runnerFile, loadRunnerScript(), "utf8");

const child = spawn(process.execPath, [runnerFile], {
  // RUNNER_SCRIPT предпочитает BROWSER_RPC_SECRET. Явно перезаписываем оба
  // имени: иначе локальный .env с другим BROWSER_RPC_SECRET заставляет
  // дочерний runner проверять подпись не тем ключом, которым её подписывает
  // этот smoke-test, и create ложно выглядит сломанным.
  env: { ...process.env, PORT, AUTH_SECRET: SECRET, BROWSER_RPC_SECRET: SECRET },
  stdio: ["ignore", "pipe", "pipe"],
});
let runnerLog = "";
child.stdout.on("data", (d) => { runnerLog += d; });
child.stderr.on("data", (d) => { runnerLog += d; });

try {
  let started = false;
  let warm = false;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${URL_BASE}/health`);
      if (res.ok) {
        started = true;
        const health = await res.json();
        // Прогрев Chromium при старте: без него первое действие учителя
        // платит несколько секунд на запуск браузера.
        if (health.chromiumReady) { warm = true; break; }
      }
    } catch { /* ещё не поднялся */ }
    await sleep(500);
  }
  check("раннер из sandbox-runner-code.ts поднимается", started);
  check("Chromium прогревается при старте раннера", warm);
  if (!started) throw new Error(`runner не ответил на /health.\n${runnerLog.slice(-1500)}`);

  const unsigned = await fetch(`${URL_BASE}/_agent/browser`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "create", userId: "probe-user" }),
  });
  check("запрос без подписи отклоняется (401)", unsigned.status === 401, String(unsigned.status));

  const created = await rpc({ action: "create", userId: "probe-user" });
  const sessionId = created.sessionId;
  check("create возвращает sessionId", Boolean(sessionId), sessionId);
  if (!sessionId) throw new Error("нет sessionId");

  const title = await rpc({ action: "title", sessionId, args: {} });
  check("title отвечает строкой", typeof title.result === "string", JSON.stringify(title.result));
  check("служебный title не тащит скриншот", !title.screenshotBase64);

  const nav = await rpc({ action: "navigate", sessionId, args: { url: "https://example.com" } });
  check("navigate вернул currentUrl", nav.currentUrl === "https://example.com/", nav.currentUrl);
  check("navigate приложил скриншот", typeof nav.screenshotBase64 === "string");

  const state = await rpc({ action: "storageState", sessionId, args: {} });
  check("storageState отдаёт куки", Array.isArray(state.result?.cookies), `${state.result?.cookies?.length ?? "-"} cookies`);
  check("служебный storageState не тащит скриншот", !state.screenshotBase64);

  const noArg = await rpc({ action: "evaluate", sessionId, args: { script: "() => document.title" } });
  check("evaluate: исходник функции без аргумента", noArg.result === "Example Domain", JSON.stringify(noArg.result));

  // Строка-выражение (IIFE), а не исходник функции. Именно так приходит
  // INTERACTABLES_SCRIPT: раньше раннер выполнял его в Node, где document не
  // существует, и агент получал пустой список кликабельных элементов.
  const iife = await rpc({
    action: "evaluate",
    sessionId,
    args: { script: "(() => { const a = document.querySelectorAll('a'); return a.length + ' ссылок'; })()" },
  });
  check("evaluate: строковое выражение (IIFE)", iife.result === "1 ссылок", JSON.stringify(iife.result));

  const withArg = await rpc({
    action: "evaluate",
    sessionId,
    args: {
      script: "([x, y]) => { const el = document.elementFromPoint(x, y); return el ? el.tagName : null; }",
      arg: [10, 10],
    },
  });
  check(
    "evaluate передаёт аргумент (разведка элемента)",
    typeof withArg.result === "string" && withArg.result.length > 0,
    JSON.stringify(withArg.result),
  );

  // inspectActiveField / detectPageAuthBarrier из browser-dom.ts работают
  // поверх этих же вызовов — проверяем, что DOM реально доступен.
  const active = await rpc({
    action: "evaluate",
    sessionId,
    args: { script: "() => { const el = document.activeElement; return { tag: (el && el.tagName || '').toLowerCase(), isBody: el === document.body }; }" },
  });
  check("DOM достижим для inspectActiveField", Boolean(active.result && typeof active.result === "object"), JSON.stringify(active.result));

  const captured = await rpc({ action: "screenshot", sessionId, captureScreenshot: true, args: {} });
  check("screenshot с captureScreenshot отдаёт base64", typeof captured.screenshotBase64 === "string");

  const plainShot = await rpc({ action: "screenshot", sessionId, args: {} });
  check("screenshot без флага отдаёт JPEG", plainShot.image === true && plainShot.bytes > 1000, `${plainShot.bytes} bytes`);

  const mouseDown = await rpc({ action: "mouseDown", sessionId, args: {} });
  const mouseUp = await rpc({ action: "mouseUp", sessionId, args: {} });
  check("mouseDown/mouseUp поддержаны (drag)", mouseDown.ok === true && mouseUp.ok === true);

  // Проверяем через navigate — это ровно путь, которым агент открывает URL.
  // `evaluate(fetch(...))` не годится: Chromium может вернуть undefined при
  // отменённом Route, скрыв факт блокировки за различиями версий Playwright.
  const ssrf = await rpc({
    action: "navigate",
    sessionId,
    args: { url: "http://169.254.169.254/latest/meta-data/" },
  });
  check(
    "SSRF-guard блокирует метаданные облака",
    ssrf.status === 502 && /abort|failed|denied|blocked/i.test(String(ssrf.error ?? "")),
    JSON.stringify(ssrf),
  );

  const gone = await rpc({ action: "status", sessionId: "нет-такой-сессии", args: {} });
  check("неизвестная сессия → 410", gone.status === 410 || String(gone.error).includes("Session expired"), JSON.stringify(gone));
} catch (error) {
  check("прогон завершился без исключений", false, error.message);
} finally {
  child.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} проверок пройдено`);
if (failed.length) {
  console.log("--- лог runner ---");
  console.log(runnerLog.slice(-2000));
  process.exit(1);
}
