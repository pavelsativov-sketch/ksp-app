import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Рабочий каталог агента. Раньше команда выполнялась в `process.cwd()`,
 * то есть в корне приложения рядом с `.env.local`.
 */
const SANDBOX_DIR = path.join(os.tmpdir(), "mekty-agent-terminal");

/**
 * Allowlist вместо blocklist, причём БЕЗ запуска процессов.
 *
 * Прежняя реализация была `exec(cmd)` с бан-листом из пяти строк. Любой
 * пользователь с сессией получал выполнение произвольного кода в процессе
 * Next.js: `powershell -c`, `curl | sh`, `node -e`, чтение `.env.local` —
 * всё проходило мимо бана.
 *
 * Теперь набор команд настолько мал, что проще реализовать его нативно, чем
 * искать оболочку. Побочные выгоды: не нужен `spawn` (на Windows он падал с
 * `spawn cmd.exe ENOENT`, потому что у Next-процесса неполное окружение),
 * нет риска инъекции аргументов и нет зависимости от PATH хоста.
 */

const HELP = [
  "Доступные команды:",
  "  help            эта справка",
  "  pwd             рабочий каталог агента",
  "  ls              содержимое рабочего каталога",
  "  echo <текст>    вывести текст",
  "  node --version  версия Node.js",
  "  date            дата и время сервера",
  "  whoami          идентификатор рабочей области",
  "  clear           очистить экран",
].join("\n");

const MAX_ECHO = 400;

async function ensureSandbox(): Promise<void> {
  await fs.mkdir(SANDBOX_DIR, { recursive: true });
}

function identity(): string {
  // Псевдоним рабочей области. Настоящего пользователя ОС здесь нет —
  // и не должно быть: процессы не запускаются.
  return "agent";
}

async function runWhitelisted(raw: string): Promise<string> {
  const cmd = raw.trim();
  const lower = cmd.toLowerCase();

  if (lower === "help" || lower === "?") return HELP;
  if (lower === "pwd") return SANDBOX_DIR;
  if (lower === "date") return new Date().toString();
  if (lower === "whoami") return identity();
  if (lower === "node --version" || lower === "node -v") return process.version;

  if (lower === "clear" || lower === "cls") return "";

  const echo = cmd.match(/^echo\s+(.+)$/i);
  if (echo) return echo[1]!.slice(0, MAX_ECHO);

  if (lower === "ls" || lower === "dir" || lower === "ls -la" || lower === "ls -l") {
    await ensureSandbox();
    const entries = await fs.readdir(SANDBOX_DIR, { withFileTypes: true });
    if (entries.length === 0) return "(пусто)";
    return entries
      .map((entry) => (entry.isDirectory() ? `[dir]  ${entry.name}` : `       ${entry.name}`))
      .join("\n");
  }

  throw new Error("not_allowed");
}

export async function POST(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`agent:terminal:${auth.user.id}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, error: "Слишком много команд. Подождите минуту." },
      { status: 429 },
    );
  }

  let cmd: unknown;
  try {
    ({ cmd } = await req.json());
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof cmd !== "string" || cmd.length === 0 || cmd.length > 500) {
    return NextResponse.json({ success: false, error: "No command" }, { status: 400 });
  }

  // Многострочный ввод и операторы `;`/`&&`/`|`/`&`/`>`/перенаправления —
  // типичные попытки выйти за пределы allowlist, поэтому отсекаем на входе.
  if (/[\r\n;&|`$><*?]/.test(cmd)) {
    return NextResponse.json({
      success: false,
      error: "Многострочные команды, цепочки и перенаправления запрещены политикой безопасности.",
    });
  }

  try {
    const output = await runWhitelisted(cmd);
    return NextResponse.json({ success: true, output: output.slice(0, 5000) });
  } catch (error) {
    if (error instanceof Error && error.message === "not_allowed") {
      return NextResponse.json({
        success: false,
        error:
          "Команда не разрешена. В этой рабочей области доступны только команды " +
          "help, pwd, ls, echo, node --version, date, whoami, clear — " +
          "выполнение произвольных команд на сервере отключено.",
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message.slice(0, 500) });
  }
}