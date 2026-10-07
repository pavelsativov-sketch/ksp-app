import { spawn, execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, lstat, writeFile, chmod } from "node:fs/promises";
import path from "node:path";

const appUrl = String(process.env.RUNNER_APP_URL || "").replace(/\/$/, "");
const executionId = process.env.RUNNER_EXECUTION_ID || "";
const userId = process.env.RUNNER_USER_ID || "";
const expiresAt = Number(process.env.RUNNER_EXPIRES_AT);
const signature = process.env.RUNNER_SIGNATURE || "";
const workspace = "/workspace";
const requestHeaders = { "content-type": "application/json", "X-Mekty-Runner-Signature": signature };

if (!/^https:\/\//.test(appUrl) || !/^[0-9a-f-]{36}$/i.test(executionId) || !/^[a-f\d]{24}$/i.test(userId)
  || !Number.isSafeInteger(expiresAt) || !signature) {
  process.stderr.write("Runner variables are missing or invalid.\n");
  process.exit(2);
}

async function callBridge(payload) {
  const response = await fetch(`${appUrl}/api/agents/gitlab/command`, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify({ executionId, userId, expiresAt, ...payload }),
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `Runner bridge returned ${response.status}`);
  return body;
}

function safeRelativeName(value) {
  if (typeof value !== "string" || !value || value.startsWith("/") || value.includes("\\")
    || value.split("/").some((part) => !part || part === "." || part === ".." || /[\u0000-\u001f]/.test(part))) return false;
  return true;
}

async function writeInitialFiles(files) {
  let total = 0;
  for (const file of files) {
    const prefix = "workspace/";
    if (typeof file.path !== "string" || typeof file.name !== "string" || typeof file.content !== "string") throw new Error("Invalid workspace file");
    const relative = `${file.path === "workspace" ? "" : file.path.slice(prefix.length)}${file.path === "workspace" ? "" : "/"}${file.name}`;
    if (!safeRelativeName(relative) || Buffer.byteLength(file.content, "utf8") > 200_000) throw new Error("Invalid workspace path or file size");
    total += Buffer.byteLength(file.content, "utf8");
    if (total > 2_000_000) throw new Error("Workspace exceeds the 2 MB limit");
    const target = path.resolve(workspace, relative);
    if (!target.startsWith(`${workspace}${path.sep}`)) throw new Error("Workspace path escaped its root");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, { encoding: "utf8", mode: 0o600 });
  }
}

async function collectFiles(directory = workspace, relative = "") {
  const output = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (!safeRelativeName(childRelative)) throw new Error("Invalid path created by command");
    const absolute = path.join(directory, entry.name);
    const stats = await lstat(absolute);
    if (stats.isSymbolicLink()) throw new Error("Symbolic links are not saved into the persistent workspace");
    if (stats.isDirectory()) {
      output.push(...await collectFiles(absolute, childRelative));
    } else if (stats.isFile()) {
      if (stats.size > 200_000) throw new Error("A workspace file exceeds the 200 KB limit");
      const content = await readFile(absolute);
      if (content.includes(0)) throw new Error("Binary files are not supported in the persistent workspace");
      output.push({ path: path.posix.dirname(`workspace/${childRelative}`), name: path.posix.basename(childRelative), content: content.toString("utf8") });
      if (output.length > 500) throw new Error("The workspace has more than 500 files");
    }
  }
  return output;
}

function boundedCapture(stream, limit) {
  let captured = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => { if (captured.length < limit) captured += chunk.slice(0, limit - captured.length); });
  return () => captured;
}

let exitCode = 1;
let stdout = "";
let stderr = "";
let files = [];
try {
  const initialized = await callBridge({ action: "start" });
  if (typeof initialized.command !== "string" || !Array.isArray(initialized.files)) throw new Error("Runner bridge returned an invalid task");
  await mkdir(workspace, { recursive: true, mode: 0o777 });
  await writeInitialFiles(initialized.files);
  execFileSync("chown", ["-R", "65534:65534", workspace]);
  await chmod(workspace, 0o777);
  const timeoutMs = Math.min(Math.max(Number(initialized.timeoutMs) || 30_000, 1000), 90_000);
  const setpriv = spawn("setpriv", ["--reuid=65534", "--regid=65534", "--clear-groups", "--", "/bin/bash", "-lc", initialized.command], {
    cwd: workspace,
    detached: true,
    env: {
      PATH: "/usr/local/bin:/usr/bin:/bin",
      HOME: workspace,
      TMPDIR: "/tmp",
      PWD: workspace,
      LANG: "C.UTF-8",
      TERM: "dumb",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const getStdout = boundedCapture(setpriv.stdout, 18_000);
  const getStderr = boundedCapture(setpriv.stderr, 8_000);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try { process.kill(-setpriv.pid, "SIGKILL"); } catch { setpriv.kill("SIGKILL"); }
  }, timeoutMs);
  exitCode = await new Promise((resolve, reject) => {
    setpriv.once("error", reject);
    setpriv.once("close", (code, signal) => resolve(timedOut ? 124 : (code ?? (signal ? 1 : 0))));
  }).finally(() => clearTimeout(timer));
  stdout = getStdout();
  stderr = getStderr();
  if (timedOut) stderr += "\nCommand timed out.";
  files = await collectFiles();
} catch (error) {
  stderr = error instanceof Error ? error.message.slice(0, 8000) : "Runner command failed";
  try { files = await collectFiles(); } catch { files = []; }
}

try {
  await callBridge({ action: "finish", exitCode, stdout, stderr, files });
  process.exitCode = 0;
} catch (error) {
  process.stderr.write(`Could not save runner result: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
}
