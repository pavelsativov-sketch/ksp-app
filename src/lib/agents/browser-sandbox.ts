/**
 * Playwright browser runner inside Vercel Sandbox.
 *
 * Architecture:
 *   1. On first use: install playwright + chromium in /tmp (one-time, ~3-5 min).
 *   2. Start a background Node.js worker that keeps one Chromium instance alive.
 *   3. Each agent action → write command JSON to /tmp, read result JSON from /tmp.
 *   4. After agent finishes → close worker, read final session state.
 *   5. Caller persists storageState to MongoDB (via persistSandboxBrowserState),
 *      so the user can continue in the Browser tab (Cloudflare loads those cookies).
 *
 * No Cloudflare daily limit applies — Chromium runs inside the Vercel Sandbox VM.
 */
import "server-only";
import type { AgentPage } from "./computer/loop";

// Re-export the Sandbox type shape we actually need (avoids hard import from @vercel/sandbox).
interface SandboxFs {
  readFile(path: string, encoding: string): Promise<string>;
  writeFile(path: string, content: string, encoding: string): Promise<void>;
  unlink?(path: string): Promise<void>;
}
interface SandboxCmd {
  exitCode: number;
  stdout(): Promise<string>;
  stderr(): Promise<string>;
}
export interface BrowserSandbox {
  fs: SandboxFs;
  runCommand(opts: { cmd: string; args: string[]; cwd?: string; timeoutMs?: number }): Promise<SandboxCmd>;
}

// ── File paths inside Vercel Sandbox /tmp ─────────────────────────────────
const WORKER_PATH      = "/tmp/mekty-browser-worker.js";
const READY_FILE       = "/tmp/mekty-browser-ready";
const CMD_PREFIX       = "/tmp/mekty-cmd-";
const RES_PREFIX       = "/tmp/mekty-res-";
const STATE_FILE       = "/tmp/mekty-browser-state.json";
const PLAYWRIGHT_READY = "/tmp/mekty-playwright-ready";

const POLL_MS           = 50;
const ACTION_TIMEOUT_MS = 45_000;
const WORKER_TIMEOUT_MS = 14 * 60_000; // 14 мин — чуть ниже 15-мин TTL sandbox

// ── Worker script (CommonJS) ───────────────────────────────────────────────
// Запускается как фоновый процесс внутри Vercel Sandbox; держит один
// экземпляр Chromium и обрабатывает команды через JSON-файлы в /tmp.
const WORKER_SCRIPT = `
'use strict';
const { chromium } = require('/tmp/node_modules/playwright');
const fs = require('fs').promises;
const syncFs = require('fs');

const READY_FILE = '/tmp/mekty-browser-ready';
const LOG_FILE   = '/tmp/mekty-browser-worker.log';

function workerLog(msg) {
  try { syncFs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + msg + '\\n'); } catch {}
}

process.on('exit', () => {
  try { syncFs.unlinkSync(READY_FILE); } catch {}
});
process.on('SIGTERM', () => {
  try { syncFs.unlinkSync(READY_FILE); } catch {}
  process.exit(0);
});
process.on('SIGINT', () => {
  try { syncFs.unlinkSync(READY_FILE); } catch {}
  process.exit(0);
});
const STATE_FILE = '/tmp/mekty-browser-state.json';
const POLL_MS    = 150;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function processAction(page, context, cmd) {
  switch (cmd.action) {
    case 'screenshot': {
      const bytes = await page.screenshot({ type: 'jpeg', quality: Number(cmd.quality ?? 55) });
      return { screenshotBase64: Buffer.from(bytes).toString('base64') };
    }
    case 'navigate': {
      let res = null;
      try {
        res = await page.goto(String(cmd.url), {
          waitUntil: 'domcontentloaded',
          timeout: Number(cmd.timeoutMs ?? 20000),
        });
      } catch (gotoErr) {
        workerLog('goto warning: ' + (gotoErr && gotoErr.message ? gotoErr.message : gotoErr));
      }
      return { result: { url: page.url(), status: res && typeof res.status === 'function' ? res.status() : null } };
    }
    case 'click':
      await page.mouse.click(Number(cmd.x), Number(cmd.y), {
        button: String(cmd.button ?? 'left'),
        clickCount: Number(cmd.clickCount ?? 1),
      });
      await page.waitForTimeout(400);
      return {};
    case 'type':
      await page.keyboard.type(String(cmd.text ?? ''), { delay: 10 });
      return {};
    case 'press':
      await page.keyboard.press(String(cmd.key ?? 'Enter'));
      await page.waitForTimeout(400);
      return {};
    case 'wheel':
    case 'scroll':
      await page.mouse.wheel(Number(cmd.dx ?? 0), Number(cmd.dy ?? 300));
      await page.waitForTimeout(250);
      return {};
    case 'move':
      await page.mouse.move(Number(cmd.x ?? 0), Number(cmd.y ?? 0));
      return {};
    case 'back':
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: Number(cmd.timeoutMs ?? 10000) }).catch(() => {});
      return {};
    case 'forward':
      await page.goForward({ waitUntil: 'domcontentloaded', timeout: Number(cmd.timeoutMs ?? 10000) }).catch(() => {});
      return {};
    case 'reload':
      await page.reload({ waitUntil: 'domcontentloaded', timeout: Number(cmd.timeoutMs ?? 10000) }).catch(() => {});
      return {};
    case 'wait':
      await page.waitForTimeout(Number(cmd.ms ?? 1000));
      return {};
    case 'title':
      return { result: await page.title() };
    case 'status':
      return { result: { open: true, url: page.url() } };
    case 'evaluate': {
      // eslint-disable-next-line no-eval
      const fn = eval('(' + String(cmd.script) + ')');
      const result = await page.evaluate(fn, cmd.arg ?? undefined);
      return { result };
    }
    case 'storageState':
      return { result: await context.storageState() };
    default:
      throw new Error('Unknown action: ' + cmd.action);
  }
}

async function main() {
  let state = { storageState: null, currentUrl: 'about:blank' };
  try { state = JSON.parse(await fs.readFile(STATE_FILE, 'utf8')); } catch {}

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const ctxOpts = { viewport: { width: 1280, height: 800 }, javaScriptEnabled: true };
  if (state.storageState && typeof state.storageState === 'object') {
    ctxOpts.storageState = state.storageState;
  }
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();

  if (state.currentUrl && (state.currentUrl.startsWith('http://') || state.currentUrl.startsWith('https://'))) {
    await page.goto(state.currentUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  }

  // Сигнализируем готовность (PID в файле)
  await fs.writeFile(READY_FILE, String(process.pid));

  // Цикл обработки команд
  while (true) {
    await sleep(POLL_MS);
    let files;
    try { files = await fs.readdir('/tmp'); } catch { continue; }

    const cmdFile = files.find(f => f.startsWith('mekty-cmd-') && f.endsWith('.json'));
    if (!cmdFile) continue;

    const id      = cmdFile.slice('mekty-cmd-'.length, -'.json'.length);
    const cmdPath = '/tmp/' + cmdFile;
    const resPath = '/tmp/mekty-res-' + id + '.json';

    let cmd;
    try {
      cmd = JSON.parse(await fs.readFile(cmdPath, 'utf8'));
      await fs.unlink(cmdPath).catch(() => {});
    } catch { continue; }

    if (cmd.action === 'close') {
      const finalState = { storageState: await context.storageState(), currentUrl: page.url() };
      await fs.writeFile(STATE_FILE, JSON.stringify(finalState)).catch(() => {});
      await fs.writeFile(resPath, JSON.stringify({ ok: true }));
      await browser.close().catch(() => {});
      process.exit(0);
    }

    try {
      const result = await processAction(page, context, cmd);
      const newState = { storageState: await context.storageState(), currentUrl: page.url() };
      await fs.writeFile(STATE_FILE, JSON.stringify(newState)).catch(() => {});
      await fs.writeFile(resPath, JSON.stringify({ ...result, currentUrl: page.url(), pageTitle: await page.title().catch(() => '') }));
    } catch (err) {
      await fs.writeFile(resPath, JSON.stringify({ error: String(err && err.message ? err.message : err) }));
    }
  }
}

main().catch(err => {
  process.stderr.write('Browser worker crashed: ' + String(err && err.message ? err.message : err) + '\\n');
  process.exit(1);
});
`;

// ── Helpers ────────────────────────────────────────────────────────────────

async function ensurePlaywright(sandbox: BrowserSandbox): Promise<void> {
  try {
    await sandbox.fs.readFile("/tmp/node_modules/playwright/package.json", "utf8");
    return; // уже установлен
  } catch {}

  const install = await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", "npm --prefix /tmp install playwright && npx --prefix /tmp playwright install chromium"],
    cwd: "/tmp",
    timeoutMs: 120_000,
  });

  if (install.exitCode !== 0) {
    const err = await install.stderr();
    const out = await install.stdout();
    throw new Error(`Playwright installation failed: ${(err || out).slice(-300)}`);
  }
}

async function isWorkerRunning(sandbox: BrowserSandbox): Promise<boolean> {
  try {
    const raw = await sandbox.fs.readFile(READY_FILE, "utf8");
    const pid = raw.trim();
    if (!pid || !/^\d+$/.test(pid)) {
      try { await sandbox.fs.unlink?.(READY_FILE); } catch {}
      return false;
    }
    const check = await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", "kill -0 " + pid],
      timeoutMs: 3000,
    });
    if (check.exitCode === 0) return true;
    try { await sandbox.fs.unlink?.(READY_FILE); } catch {}
    return false;
  } catch {
    return false;
  }
}

async function startWorker(
  sandbox: BrowserSandbox,
  storageState: unknown,
  currentUrl: string,
): Promise<void> {
  // Записываем начальное состояние сессии (куки из предыдущего запуска)
  const state = { storageState: storageState ?? null, currentUrl };
  await sandbox.fs.writeFile(STATE_FILE, JSON.stringify(state), "utf8");

  // Очищаем старые файлы ready и лога, чтобы не читать ошибки предыдущих запусков
  try { await sandbox.fs.unlink?.(READY_FILE); } catch {}
  try { await sandbox.fs.unlink?.("/tmp/mekty-browser-worker.log"); } catch {}

  // Пишем скрипт воркера
  await sandbox.fs.writeFile(WORKER_PATH, WORKER_SCRIPT, "utf8");

  // Запускаем воркер в фоне через nohup (перезаписываем лог через >)
  await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", "nohup node " + WORKER_PATH + " > /tmp/mekty-browser-worker.log 2>&1 &"],
    cwd: "/tmp",
    timeoutMs: 10_000,
  });

  // Ждём готовности (воркер пишет READY_FILE когда Chromium запущен)
  const deadline = Date.now() + 35_000;
  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, 600));
    if (await isWorkerRunning(sandbox)) return;
  }

  // Только если воркер НЕ запустился за 35 секунд — читаем лог ошибки
  let errLog = "";
  try { errLog = await sandbox.fs.readFile("/tmp/mekty-browser-worker.log", "utf8"); } catch {}
  const summary = errLog.length > 1200 ? (errLog.slice(0, 600) + "\n...[truncated]...\n" + errLog.slice(-600)) : errLog;
  throw new Error("Browser worker failed to start within 35 seconds. Log: " + (summary || "empty"));
}

let cmdCounter = 0;

async function sendCmd<T extends Record<string, unknown>>(
  sandbox: BrowserSandbox,
  action: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const id      = `${Date.now()}-${++cmdCounter}`;
  const cmdPath = `${CMD_PREFIX}${id}.json`;
  const resPath = `${RES_PREFIX}${id}.json`;

  await sandbox.fs.writeFile(cmdPath, JSON.stringify({ action, ...args }), "utf8");

  const deadline = Date.now() + ACTION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, POLL_MS));
    try {
      const raw    = await sandbox.fs.readFile(resPath, "utf8");
      const result = JSON.parse(raw) as T & { error?: string };
      try { await sandbox.fs.unlink?.(resPath); } catch {}
      if ("error" in result && result.error) throw new Error(String(result.error));
      return result;
    } catch (e) {
      if (e instanceof Error && (e.message.includes("ENOENT") || e.message.includes("not found") || e.message.includes("no such"))) {
        continue;
      }
      throw e;
    }
  }
  try { await sandbox.fs.unlink?.(cmdPath); } catch {}
  const stillAlive = await isWorkerRunning(sandbox);
  if (!stillAlive) {
    try { await sandbox.fs.unlink?.(READY_FILE); } catch {}
    throw new Error(`Browser worker died unexpectedly during action '${action}'`);
  }
  throw new Error(`Browser action '${action}' timed out after ${ACTION_TIMEOUT_MS}ms`);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Создаёт объект AgentPage, использующий Playwright внутри Vercel Sandbox.
 * Все методы общаются с воркером через файловую систему /tmp.
 */
export function makeSandboxAgentPage(sandbox: BrowserSandbox): AgentPage {
  let currentUrl = "about:blank";

  const send = async <T extends Record<string, unknown>>(action: string, args: Record<string, unknown> = {}): Promise<T> => {
    const result = await sendCmd<T & { currentUrl?: string }>(sandbox, action, args);
    if (result.currentUrl) currentUrl = result.currentUrl;
    return result;
  };

  return {
    screenshot: async (opts) => {
      const res = await send<{ screenshotBase64: string }>("screenshot", { quality: opts.quality });
      return new Uint8Array(Buffer.from(res.screenshotBase64, "base64"));
    },
    mouse: {
      click:  async (x, y, opts) => { await send("click", { x, y, button: opts?.button ?? "left", clickCount: opts?.clickCount ?? 1 }); },
      move:   async (x, y)       => { await send("move",  { x, y }); },
      wheel:  async (dx, dy)     => { await send("wheel", { dx, dy }); },
      down:   async ()           => { /* нет аналога в file-IPC */ },
      up:     async ()           => { /* нет аналога в file-IPC */ },
    },
    keyboard: {
      type:  async (text)  => { await send("type",  { text }); },
      press: async (key)   => { await send("press", { key }); },
    },
    goto:           async (url, opts)  => { await send("navigate", { url, timeoutMs: opts?.timeout ?? 25000 }); return null; },
    goBack:         async (opts)       => { await send("back",    { timeoutMs: opts?.timeout ?? 10000 }); return null; },
    goForward:      async (opts)       => { await send("forward", { timeoutMs: opts?.timeout ?? 10000 }); return null; },
    waitForTimeout: async (ms)         => { await send("wait", { ms }); },
    url:            ()                 => currentUrl,
    title:          async ()           => { const r = await send<{ result: string }>("title"); return r.result ?? ""; },
    evaluate:       async (fn, arg)    => {
      const script = typeof fn === "string" ? fn : fn.toString();
      const r = await send<{ result: unknown }>("evaluate", { script, arg: arg ?? null });
      return r.result;
    },
  };
}

/**
 * Возвращает последнее состояние браузера (куки, URL) из файла состояния в sandbox.
 * Используется для передачи сессии в MongoDB после завершения агента.
 */
export async function getSandboxBrowserState(
  sandbox: BrowserSandbox,
): Promise<{ storageState: unknown; currentUrl: string }> {
  try {
    const raw = await sandbox.fs.readFile(STATE_FILE, "utf8");
    return JSON.parse(raw) as { storageState: unknown; currentUrl: string };
  } catch {
    return { storageState: null, currentUrl: "about:blank" };
  }
}

/**
 * Запускает Playwright браузер в Vercel Sandbox и возвращает AgentPage.
 *
 * При первом запуске устанавливает Playwright (~3-5 мин). Subsequent запуски
 * используют уже установленный браузер, воркер стартует за ~10-15 сек.
 *
 * @param opts.storageState - куки из предыдущей сессии (из MongoDB)
 * @param opts.currentUrl   - страница, с которой начинает агент
 */
export async function startSandboxBrowser(
  sandbox: BrowserSandbox,
  opts: { storageState?: unknown; currentUrl?: string } = {},
): Promise<AgentPage> {
  await ensurePlaywright(sandbox);

  if (!await isWorkerRunning(sandbox)) {
    await startWorker(sandbox, opts.storageState ?? null, opts.currentUrl ?? "about:blank");
  }

  return makeSandboxAgentPage(sandbox);
}

/**
 * Gracefully завершает воркер (он сохраняет состояние и выходит).
 */
export async function closeSandboxBrowser(sandbox: BrowserSandbox): Promise<void> {
  try {
    await sendCmd(sandbox, "close");
  } catch {
    // воркер мог уже завершиться по таймауту
  }
  try { await sandbox.fs.unlink?.(READY_FILE); } catch {}
}
