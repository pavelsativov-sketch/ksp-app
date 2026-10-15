/**
 * Живая проверка Codespaces runner'а: поднимает его и прогоняет действия,
 * которые школа ОС шлёт из вкладки «Браузер» и из агента.
 *
 * Запуск:
 *   node scripts/check-runner.mjs
 *   AUTH_SECRET=<32+ символа> node scripts/check-runner.mjs
 *
 * Секрет нужен только для локального прогона; в Codespaces он уже задан в
 * окружении и скрипт пойдёт по нему.
 */
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

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

const child = spawn(process.execPath, ["scripts/browser-runner-node.mjs"], {
  env: { ...process.env, PORT, AUTH_SECRET: SECRET },
  stdio: ["ignore", "pipe", "pipe"],
});
let runnerLog = "";
child.stdout.on("data", (d) => { runnerLog += d; });
child.stderr.on("data", (d) => { runnerLog += d; });

try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`${URL_BASE}/health`)).ok) break;
    } catch { /* ещё не поднялся */ }
    await sleep(500);
  }

  const created = await rpc({ action: "create", userId: "probe-user" });
  const sessionId = created.sessionId;
  check("create возвращает sessionId", Boolean(sessionId), sessionId);
  if (!sessionId) throw new Error("нет sessionId — дальнейшие проверки бессмысленны");

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
  check("evaluate без аргумента", noArg.result === "Example Domain", JSON.stringify(noArg.result));

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

  const ssrf = await rpc({
    action: "evaluate",
    sessionId,
    args: { script: "async () => { try { const r = await fetch('http://169.254.169.254/latest/meta-data/'); return 'status:' + r.status; } catch { return 'blocked'; } }" },
  });
  check("SSRF-guard блокирует метаданные облака", ssrf.result === "blocked", JSON.stringify(ssrf.result));

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