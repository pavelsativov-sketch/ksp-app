/**
 * Проверка безопасности браузерного раннера БЕЗ интернета.
 *
 * Поднимает тот же раннер, что едет в Vercel Sandbox и на ПК
 * (`src/lib/agents/sandbox-runner-code.ts`), и проверяет:
 *   - запросы без подписи, с чужой подписью и с протухшим временем отклоняются;
 *   - слишком большое тело отклоняется;
 *   - чужая или несуществующая сессия получает 410;
 *   - переходы во внутреннюю сеть блокируются защитой подзапросов;
 *   - evaluate принимает только функции и не исполняет произвольные операторы;
 *   - сессия закрывается и после закрытия недоступна.
 *
 * Запуск: node scripts/check-runner-security.mjs
 * Код возврата 0 — всё прошло, 1 — есть провалы.
 */
import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

function loadRunnerScript() {
  const file = path.join(process.cwd(), "src", "lib", "agents", "sandbox-runner-code.ts");
  const source = readFileSync(file, "utf8");
  const marker = "RUNNER_SCRIPT = `";
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`в ${file} не найден RUNNER_SCRIPT`);
  const body = source.slice(start + marker.length, source.lastIndexOf("`"));
  let script = new Function(`return \`${body}\`;`)();
  // На Windows/macOS Chromium запускается со своей песочницей; --no-sandbox
  // нужен только в контейнере под root (Linux CI, Vercel Sandbox).
  if (process.platform === "win32" || process.platform === "darwin" || process.env.LOCAL_BROWSER_NO_SANDBOX !== "1" && process.getuid?.() !== 0) {
    script = script
      .replace(/^\s*["']--no-sandbox["'],?\s*$/m, "")
      .replace(/^\s*["']--disable-setuid-sandbox["'],?\s*$/m, "");
  }
  return script;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

const SECRET = crypto.randomBytes(24).toString("hex");
const OTHER_SECRET = crypto.randomBytes(24).toString("hex");
const PORT = await freePort();
const BASE = `http://127.0.0.1:${PORT}`;

function sign(secret, timestamp, raw) {
  return crypto.createHmac("sha256", Buffer.from(secret)).update(`${timestamp}.${raw}`).digest("base64url");
}

async function post(body, { secret = SECRET, timestamp = String(Date.now()), headers = {}, raw } = {}) {
  const payload = raw ?? JSON.stringify(body);
  const response = await fetch(`${BASE}/_agent/browser`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-mekty-timestamp": timestamp, "x-mekty-signature": sign(secret, timestamp, payload) } : {}),
      ...headers,
    },
    body: payload,
  });
  const type = response.headers.get("content-type") || "";
  if (type.startsWith("image/")) return { status: response.status, image: true, bytes: (await response.arrayBuffer()).byteLength };
  let json = null;
  try { json = await response.json(); } catch { /* пусто */ }
  return { status: response.status, json };
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// Локальный «внутренний сервис»: если защита подзапросов сломана, раннер до него дотянется.
let internalHits = 0;
const internal = http.createServer((req, res) => {
  internalHits += 1;
  res.writeHead(200, { "content-type": "text/html" });
  res.end("<title>INTERNAL-SECRET</title>internal");
});
await new Promise((resolve) => internal.listen(0, "127.0.0.1", resolve));
const internalPort = internal.address().port;

const runnerDir = path.join(process.cwd(), "node_modules", ".cache", "mekty-runner");
mkdirSync(runnerDir, { recursive: true });
const runnerFile = path.join(runnerDir, "security-runner.mjs");
writeFileSync(runnerFile, loadRunnerScript(), "utf8");

const child = spawn(process.execPath, [runnerFile], {
  env: { ...process.env, PORT: String(PORT), BROWSER_RPC_SECRET: SECRET, AUTH_SECRET: SECRET },
  stdio: ["ignore", "pipe", "pipe"],
});
let runnerLog = "";
child.stdout.on("data", (d) => { runnerLog += d; });
child.stderr.on("data", (d) => { runnerLog += d; });

let exitCode = 0;
try {
  let up = false;
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok && (await res.json()).chromiumReady) { up = true; break; }
    } catch { /* ещё поднимается */ }
    await sleep(500);
  }
  check("раннер поднялся и прогрел Chromium", up);
  if (!up) throw new Error(`раннер не поднялся:\n${runnerLog.slice(-1500)}`);

  // ── Аутентификация ──
  const unsigned = await post({ action: "limits" }, { secret: null });
  check("без подписи → 401", unsigned.status === 401, String(unsigned.status));

  const wrong = await post({ action: "limits" }, { secret: OTHER_SECRET });
  check("подпись чужим ключом → 401", wrong.status === 401, String(wrong.status));

  const stale = await post({ action: "limits" }, { timestamp: String(Date.now() - 10 * 60_000) });
  check("протухшее время (10 мин) при верной подписи → 401", stale.status === 401, String(stale.status));

  const future = await post({ action: "limits" }, { timestamp: String(Date.now() + 10 * 60_000) });
  check("время из будущего → 401", future.status === 401, String(future.status));

  const garbage = await post(null, { raw: "{not json" });
  check("битый JSON при верной подписи → 400", garbage.status === 400, String(garbage.status));

  const tampered = await (async () => {
    const original = JSON.stringify({ action: "limits" });
    const timestamp = String(Date.now());
    const response = await fetch(`${BASE}/_agent/browser`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-mekty-timestamp": timestamp, "x-mekty-signature": sign(SECRET, timestamp, original) },
      body: JSON.stringify({ action: "close", sessionId: "x" }),
    });
    return response.status;
  })();
  check("подпись не переносится на другое тело → 401", tampered === 401, String(tampered));

  const ok = await post({ action: "limits" });
  check("верная подпись → 200", ok.status === 200 && ok.json?.ok === true, String(ok.status));

  const oversized = await post(null, { raw: JSON.stringify({ action: "limits", pad: "x".repeat(1_300_000) }) }).catch((e) => ({ status: 0, error: String(e) }));
  check("тело > 1 МБ отклоняется (413)", oversized.status === 413 || oversized.status === 0, String(oversized.status));

  const getRoot = await fetch(`${BASE}/_agent/browser`).then((r) => r.status);
  check("GET на RPC-путь → 405", getRoot === 405, String(getRoot));
  const unknownPath = await fetch(`${BASE}/etc/passwd`).then((r) => r.status);
  check("неизвестный путь → 404", unknownPath === 404, String(unknownPath));

  // ── Сессии ──
  const created = await post({ action: "create", userId: "probe-a" });
  const sessionId = created.json?.sessionId;
  check("create → sessionId", created.status === 200 && Boolean(sessionId));
  if (!sessionId) throw new Error("create не вернул sessionId");

  const ghost = await post({ action: "title", sessionId: crypto.randomUUID() });
  check("несуществующая сессия → 410", ghost.status === 410, String(ghost.status));

  // ── Защита от SSRF (подзапросы и переходы) ──
  const toInternal = await post({ action: "navigate", sessionId, args: { url: `http://127.0.0.1:${internalPort}/` } });
  check("переход на 127.0.0.1 блокируется", toInternal.status !== 200 || !String(toInternal.json?.pageTitle).includes("INTERNAL-SECRET"), `HTTP ${toInternal.status}`);
  check("внутренний сервис не получил ни одного запроса", internalHits === 0, `запросов: ${internalHits}`);

  const toMeta = await post({ action: "navigate", sessionId, args: { url: "http://169.254.169.254/latest/meta-data/" } });
  check("переход на 169.254.169.254 блокируется", toMeta.status !== 200 || toMeta.json?.result?.status == null || toMeta.json?.result?.status >= 400, `HTTP ${toMeta.status}`);

  const toLan = await post({ action: "navigate", sessionId, args: { url: "http://192.168.0.1/" } });
  check("переход в домашнюю сеть 192.168.0.1 блокируется", toLan.status !== 200 || toLan.json?.result?.status == null || toLan.json?.result?.status >= 400, `HTTP ${toLan.status}`);

  // Подзапрос со страницы: data:-страница пытается достучаться до внутреннего сервиса.
  const page = `data:text/html,<title>probe</title><img src="http://127.0.0.1:${internalPort}/pixel"><script>fetch("http://127.0.0.1:${internalPort}/fetch").catch(()=>{})</script>`;
  await post({ action: "navigate", sessionId, args: { url: page } });
  await sleep(800);
  check("подзапросы страницы во внутреннюю сеть блокируются", internalHits === 0, `запросов: ${internalHits}`);

  // ── Нормальная работа на безопасной странице ──
  const navOk = await post({ action: "navigate", sessionId, args: { url: "data:text/html,<title>Hello</title><button>Go</button>" } });
  check("безопасная страница открывается", navOk.status === 200 && navOk.json?.pageTitle === "Hello", `HTTP ${navOk.status}, title=${navOk.json?.pageTitle}`);
  check("после перехода приложен скриншот", typeof navOk.json?.screenshotBase64 === "string");

  const shot = await post({ action: "screenshot", sessionId });
  check("screenshot отдаёт JPEG", shot.status === 200 && shot.image === true && shot.bytes > 500, `${shot.bytes} байт`);

  // ── evaluate ──
  const stmt = await post({ action: "evaluate", sessionId, args: { script: "document.title = 'hacked'" } });
  check("evaluate: произвольный оператор отклоняется (400)", stmt.status === 400, String(stmt.status));

  const big = await post({ action: "evaluate", sessionId, args: { script: `(${"1+".repeat(5000)}1)` } });
  check("evaluate: слишком длинный скрипт отклоняется (400)", big.status === 400, String(big.status));

  const fn = await post({ action: "evaluate", sessionId, args: { script: "() => document.title" } });
  check("evaluate: функция выполняется в странице", fn.json?.result === "Hello", JSON.stringify(fn.json?.result));

  // ── Закрытие ──
  const closed = await post({ action: "close", sessionId });
  check("close → 200", closed.status === 200);
  const afterClose = await post({ action: "status", sessionId });
  check("после close сессия недоступна (410)", afterClose.status === 410, String(afterClose.status));

  // ── Лимиты ──
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const s = await post({ action: "create", userId: `probe-${i}` });
    if (s.json?.sessionId) ids.push(s.json.sessionId);
  }
  const limits = await post({ action: "limits" });
  check("лимиты отражают открытые сессии", limits.json?.activeSessionCount === ids.length, `${limits.json?.activeSessionCount}/${limits.json?.maxConcurrentSessions}`);
  for (const id of ids) await post({ action: "close", sessionId: id });
} catch (error) {
  console.error(`\nОШИБКА ПРОВЕРКИ: ${error instanceof Error ? error.message : error}`);
  results.push({ name: "проверка завершилась без исключений", ok: false });
} finally {
  child.kill("SIGTERM");
  internal.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== БЕЗОПАСНОСТЬ РАННЕРА: ${results.length - failed.length}/${results.length} ===`);
  if (failed.length) {
    for (const f of failed) console.log(`  провал: ${f.name}`);
    if (runnerLog) console.log(`\n--- хвост лога раннера ---\n${runnerLog.slice(-1200)}`);
    exitCode = 1;
  }
  await sleep(300);
  process.exit(exitCode);
}
