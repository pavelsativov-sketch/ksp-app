/**
 * Полный прогон проверки ИИ-агентов (ОС задач).
 *
 * Фазы:
 *   1. static    — инварианты исходников (быстро, без сети)
 *   2. typecheck — npm run typecheck (если есть такой скрипт)
 *   3. unit      — vitest по тестам агентов
 *   4. runner    — безопасность раннера (scripts/check-runner-security.mjs)
 *   5. live      — боевой прогон на живом сайте (только если задан BASE_URL)
 *
 * Запуск:
 *   node scripts/agents-full-check.mjs                 # фазы 1–4
 *   node scripts/agents-full-check.mjs --skip=typecheck,runner
 *   BASE_URL=https://site node scripts/agents-full-check.mjs   # + фаза live
 *
 * Отчёт: test-results/agents-full-check.json. Код возврата 1, если что-то упало.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const skip = new Set(
  (process.argv.find((a) => a.startsWith("--skip=")) ?? "").replace("--skip=", "").split(",").filter(Boolean),
);
const read = (rel) => (existsSync(path.join(root, rel)) ? readFileSync(path.join(root, rel), "utf8") : null);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const shell = process.platform === "win32";

const phases = [];
function phase(name, fn) {
  return async () => {
    if (skip.has(name)) { phases.push({ name, status: "skipped", checks: [] }); console.log(`\n── ${name}: пропущено`); return; }
    console.log(`\n── ${name} ──`);
    const checks = [];
    const t0 = Date.now();
    try { await fn((n, ok, d = "") => { checks.push({ name: n, ok, detail: d }); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); }); }
    catch (e) { checks.push({ name: "фаза завершилась без исключений", ok: false, detail: String(e?.message ?? e) }); console.log(`FAIL  ${name}: ${e?.message ?? e}`); }
    phases.push({ name, status: checks.every((c) => c.ok) ? "pass" : "fail", checks, ms: Date.now() - t0 });
  };
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: root, encoding: "utf8", shell, maxBuffer: 64 * 1024 * 1024, ...opts });
}

// ───────── 1. static ─────────
const staticPhase = phase("static", (check) => {
  const orch = read("src/lib/agents/orchestrator.ts");
  const runner = read("src/lib/agents/runner.ts");
  const rpc = read("src/lib/agents/browser-rpc.ts");
  const sandbox = read("src/lib/agents/sandbox-browser-service.ts");
  const perms = read("src/lib/agents/permissions.ts");
  const fsTool = read("src/lib/agents/tools/file-system.ts");
  const session = read("src/lib/agents/session.ts");
  const browser = read("src/lib/agents/tools/browser.ts");
  const keepalive = read("src/app/api/health/browser-keepalive/route.ts");
  const browser_session = () => read("src/lib/agents/browser-session.ts");

  check("orchestrator: нет чтения .value у findOneAndUpdate (mongodb 7)", orch && !/queued\??\.value|\)\.value\b/.test(orch));
  check("orchestrator: нет setInterval-поллера", orch && !/setInterval\s*\(/.test(orch));
  check("orchestrator: есть claimNextQueuedTask", orch && /export\s+async\s+function\s+claimNextQueuedTask/.test(orch));
  check("runner: finish() запускает следующую задачу очереди", runner && /dispatchQueuedTask/.test(runner));
  check("runner: используется контрольная точка", runner && /parseCheckpoint/.test(runner) && /buildCheckpoint/.test(runner));
  check("runner: нет 'max loops reached' как исключения", runner && !/throw new Error\(['"`]max loops reached/.test(runner));
  check("runner: отмена передаётся в вызовы модели (AbortSignal)", runner && /abortController\.signal/.test(runner));
  check("session: пауза ограничена дедлайном", session && /"timeout"/.test(session));
  check("browser-rpc: секрет подписи производный от AUTH_SECRET на пользователя", rpc && /createHmac\("sha256", auth\)/.test(rpc) && !/BROWSER_RPC_SECRET/.test(rpc));
  check("sandbox: в конфиг песочницы не пишется общий BROWSER_RPC_SECRET", sandbox && !/runner-config[\s\S]{0,400}process\.env\.BROWSER_RPC_SECRET/.test(sandbox));
  check("sandbox: устаревший секрет → перезапуск раннера", sandbox && /runner-config\.json/.test(sandbox));
  check("permissions: «всегда разрешать» не покрывает high", perms && /risk\s*===\s*["']medium["']/.test(perms));
  check("permissions: LOW только без цепочек и чтения секретов", perms && /runner-config/.test(perms));
  check("file-system: «всегда разрешать» только для medium", fsTool && /risk\s*===\s*["']medium["']/.test(fsTool));
  check("browser tools: результат ограничен boundedResult", browser && /boundedResult/.test(browser) && existsSync(path.join(root, "src/lib/agents/tools/bounded-result.ts")));
  check("keepalive: греет только Vercel Sandbox, внешних раннеров нет", keepalive && /getSandboxBrowserRpcUrl/.test(keepalive) && !/BROWSER_RPC_URL/.test(keepalive));

  const mode = read("src/lib/agents/runtime-mode.ts");
  const wsRuntime = read("src/lib/workspace/runtime.ts");
  check("режим: рабочая область только в Vercel Sandbox (нет local/external)", mode && !/"local"|"external"/.test(mode) && /"vercel-sandbox"/.test(mode));
  check("режим: есть проверка настройки agentRuntimeProblems", mode && /export function agentRuntimeProblems/.test(mode));
  check("workspace/runtime: выбор среды идёт через runtime-mode", wsRuntime && /getWorkspaceTarget/.test(wsRuntime) && !/process\.env\.VERCEL/.test(wsRuntime));
  check("browser-rpc: выбор раннера идёт через runtime-mode", rpc && /getBrowserTarget/.test(rpc) && !/process\.env\.VERCEL/.test(rpc));
  check("browser-session: выбор раннера идёт через runtime-mode", browser_session() && /getBrowserTarget/.test(browser_session()) && !/process\.env\.VERCEL/.test(browser_session()));
  // Интеграции с компьютером пользователя быть не должно: ни файлов-исходников, ни запуска оболочек.
  for (const f of ["src/lib/workspace/local-runtime.ts", "src/lib/agents/local-command-policy.ts", "scripts/local-browser-runner.mjs", "scripts/dev-local.mjs"]) {
    check(`нет локальной интеграции: ${f} удалён`, !existsSync(path.join(root, f)));
  }
  for (const [name, text] of [["workspace/runtime.ts", wsRuntime], ["tools/file-system.ts", fsTool], ["browser-session.ts", browser_session()], ["browser-rpc.ts", rpc]]) {
    check(`нет ссылок на локальный режим: ${name}`, text && !/AGENT_RUNTIME|local-runtime|BROWSER_RPC_URL|localRunnerUrl/.test(text));
  }
  for (const f of ["vercel.json", ".env.production", ".env.production.local"]) {
    const text = read(f);
    if (text) check(`${f}: нет переменных локального режима`, !/AGENT_RUNTIME|AGENT_LOCAL_RUNNER_URL|BROWSER_RPC_URL/.test(text));
  }

  const vercel = read("vercel.json");
  if (vercel) { try { const j = JSON.parse(vercel); check("vercel.json: регион bom1", Array.isArray(j.regions) ? j.regions.includes("bom1") : true, JSON.stringify(j.regions ?? null)); } catch { check("vercel.json валиден", false); } }
  const gi = read(".gitignore");
  check(".gitignore: .env.local исключён", gi && /^\.env(\.local|\*)?$/m.test(gi) || (gi && /\.env\*?/.test(gi)));
  for (const f of ["checkpoint.ts", "tools/bounded-result.ts"]) check(`файл существует: agents/${f}`, existsSync(path.join(root, "src/lib/agents", f)));
});

// ───────── 2. typecheck ─────────
const typecheckPhase = phase("typecheck", (check) => {
  const pkg = JSON.parse(read("package.json") ?? "{}");
  if (!pkg.scripts?.typecheck) { check("скрипт typecheck в package.json", false, "добавьте \"typecheck\": \"tsc --noEmit\""); return; }
  const r = run(npm, ["run", "typecheck", "--silent"]);
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  check("tsc --noEmit без ошибок", r.status === 0, r.status === 0 ? "" : out.split("\n").slice(0, 25).join("\n"));
});

// ───────── 3. unit ─────────
const unitPhase = phase("unit", (check) => {
  const tests = [
    "tests/unit/agent-checkpoint.test.ts",
    "tests/unit/agent-bounded-result.test.ts",
    "tests/unit/agent-queue-claim.test.ts",
    "tests/unit/agent-session-wait.test.ts",
    "tests/unit/agent-permissions.test.ts",
    "tests/unit/agent-start-gonka.test.ts",
    "tests/unit/browser-rpc-config.test.ts",
    "tests/unit/sandbox-runner-start.test.ts",
    "tests/unit/agent-runtime-mode.test.ts",
  ].filter((f) => existsSync(path.join(root, f)));
  const outFile = path.join(root, "test-results", "agents-vitest.json");
  mkdirSync(path.dirname(outFile), { recursive: true });
  const r = run(npx, ["vitest", "run", ...tests, "--reporter=json", `--outputFile=${outFile}`]);
  let summary = null;
  try { summary = JSON.parse(readFileSync(outFile, "utf8")); } catch { /* нет отчёта */ }
  if (!summary) { check("vitest отработал и записал отчёт", false, `${r.stdout ?? ""}${r.stderr ?? ""}`.slice(-1500)); return; }
  for (const file of summary.testResults ?? []) {
    const rel = path.relative(root, file.name).replaceAll("\\", "/");
    const failed = (file.assertionResults ?? []).filter((a) => a.status === "failed");
    check(`${rel} (${(file.assertionResults ?? []).length} тестов)`, file.status === "passed",
      failed.map((a) => `${a.title}: ${(a.failureMessages?.[0] ?? "").split("\n")[0]}`).join(" | "));
  }
  check(`итого vitest: ${summary.numPassedTests}/${summary.numTotalTests}`, summary.numFailedTests === 0);
});

// ───────── 4. runner ─────────
const runnerPhase = phase("runner", (check) => {
  const r = run(process.execPath, ["scripts/check-runner-security.mjs"], { shell: false });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const m = out.match(/БЕЗОПАСНОСТЬ РАННЕРА: (\d+)\/(\d+)/);
  const failLines = out.split("\n").filter((l) => l.startsWith("FAIL"));
  check(`безопасность раннера${m ? ` ${m[1]}/${m[2]}` : ""}`, r.status === 0, failLines.join(" | ") || (r.status === 0 ? "" : out.slice(-800)));
});

// ───────── 5. live ─────────
const livePhase = phase("live", (check) => {
  const base = process.env.BASE_URL;
  if (!base) { check("BASE_URL не задан — боевой прогон пропущен", true, "задайте BASE_URL=https://ваш-сайт, чтобы включить"); return; }
  if (existsSync(path.join(root, "scripts/check-agent-production.mjs"))) {
    const r = run(process.execPath, ["scripts/check-agent-production.mjs", base], { timeout: 15 * 60_000, shell: false });
    check("check-agent-production.mjs", r.status === 0, `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").slice(-12).join("\n"));
  } else check("scripts/check-agent-production.mjs найден", false);
});

await staticPhase();
await typecheckPhase();
await unitPhase();
await runnerPhase();
await livePhase();

mkdirSync(path.join(root, "test-results"), { recursive: true });
writeFileSync(path.join(root, "test-results", "agents-full-check.json"), JSON.stringify({ at: new Date().toISOString(), phases }, null, 2));

console.log("\n══════════ ИТОГ ══════════");
let bad = 0;
for (const p of phases) {
  const total = p.checks.length, ok = p.checks.filter((c) => c.ok).length;
  if (p.status === "fail") bad++;
  console.log(`${p.status === "pass" ? "✔" : p.status === "skipped" ? "–" : "✘"} ${p.name.padEnd(10)} ${p.status === "skipped" ? "пропущено" : `${ok}/${total}`}`);
}
console.log(bad ? `\nПровалено фаз: ${bad}. Подробности выше и в test-results/agents-full-check.json` : "\nВсё зелёное.");
process.exit(bad ? 1 : 0);
