import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { mkdir } from "fs/promises";

/**
 * Постоянная командная среда пользователя (настоящая, не визуальная):
 * на сервере живёт реальный shell-процесс с сохранением состояния
 * (cd, переменные, фоновые процессы). Пользователь и агент работают
 * в ОДНОЙ сессии — агент видит те же файлы и то же окружение, что и
 * человек в терминале.
 */

export interface ShellChunk {
  seq: number;
  text: string;
}

interface UserSession {
  proc: ChildProcess;
  cwd: string;
  buffer: ShellChunk[];
  lastSeq: number;
  /** Ожидающий exec: разрешится, когда в выводе появится маркер команды. */
  pending: { marker: string; resolve: (out: string) => void; startSeq: number; timer: NodeJS.Timeout } | null;
  lastActivity: number;
}

const sessions = new Map<string, UserSession>();
const ROOT = path.join(process.cwd(), "workspace-data", "machines");
const MAX_BUFFER = 2000; // хранить последние 2000 кусков вывода
const MARKER = (n: number) => `__MEKTY_DONE_${n}__`;

export async function machineDir(userId: string): Promise<string> {
  const dir = path.join(ROOT, /^[a-f\d]{24}$/i.test(userId) ? `u_${userId}` : "u_misc");
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Владелец управления (см. спецификацию: USER_CONTROL / AI_CONTROL).
 * Пока 'user' — агент обязан стоять на паузе и не выполнять действий.
 */
const controlMap = new Map<string, "user" | "ai">();

export function getControlOwner(userId: string): "user" | "ai" {
  return controlMap.get(userId) ?? "ai";
}

export function setControlOwner(userId: string, owner: "user" | "ai"): void {
  controlMap.set(userId, owner);
}

/** Пауза агента: пока у пользователя управление — опрашиваем каждые 800 мс. */
export async function waitForControl(userId: string, isStopped: () => Promise<boolean>): Promise<"resumed" | "stopped"> {
  for (;;) {
    if (await isStopped()) return "stopped";
    if (getControlOwner(userId) === "ai") return "resumed";
    await new Promise((r) => setTimeout(r, 800));
  }
}

/** Получить (или создать) постоянную сессию пользователя. */
export async function getShellSession(userId: string): Promise<UserSession> {
  let s = sessions.get(userId);
  if (s && s.proc.exitCode === null && !s.proc.killed) {
    s.lastActivity = Date.now();
    return s;
  }
  const cwd = await machineDir(userId);
  const isWin = process.platform === "win32";
  const proc = isWin
    ? spawn("cmd.exe", [], { cwd, windowsHide: true, env: { ...process.env, MEKTY_SANDBOX: cwd } })
    : spawn("/bin/bash", ["--norc"], { cwd, env: { ...process.env, MEKTY_SANDBOX: cwd } });

  s = { proc, cwd, buffer: [], lastSeq: 0, pending: null, lastActivity: Date.now() };
  sessions.set(userId, s);

  const push = (text: string) => {
    if (!text || !s) return;
    s.buffer.push({ seq: ++s.lastSeq, text });
    if (s.buffer.length > MAX_BUFFER) s.buffer.splice(0, s.buffer.length - MAX_BUFFER);
    const p = s.pending;
    if (p && s.buffer.some((c) => c.text.includes(p.marker))) {
      s.pending = null;
      clearTimeout(p.timer);
      // Маркер считается только в НАЧАЛЕ строки: в эхе команды он стоит после
      // приглашения (`...>echo __MEKTY_DONE_1__`), а настоящий — на своей строке.
      const out = sinceSeq(s, p.startSeq);
      const m = out.match(/(?:^|\r?\n)__MEKTY_DONE_\d+\s*(?:\r?\n|$)/);
      p.resolve((m?.index !== undefined ? out.slice(0, m.index) : out).trimEnd());
    }
  };
  proc.stdout?.on("data", (d) => push(d.toString()));
  proc.stderr?.on("data", (d) => push(d.toString()));
  proc.on("exit", () => {
    if (s) push("\r\n[сессия оболочки завершена]\r\n");
  });

  // Приветственное сообщение — как в настоящем терминале.
  push(`Mekty Machine — постоянная оболочка (${isWin ? "Windows cmd" : "bash"})\r\nРабочая папка: ${cwd}\r\n${isWin ? "" : "$ "}`);
  return s;
}

/** Вывод с момента seq. */
export function sinceSeq(s: UserSession, seq: number): string {
  return s.buffer.filter((c) => c.seq > seq).map((c) => c.text).join("");
}

/** Выполнить команду в постоянной оболочке, дождаться завершения по маркеру. */
export async function shellExec(userId: string, cmd: string, timeoutMs = 60_000): Promise<{ output: string; timedOut: boolean }> {
  const s = await getShellSession(userId);
  const n = ++(s as UserSession & { _n?: number })._n! || 1;
  const marker = MARKER(n);
  const startSeq = s.lastSeq;
  const stdin = s.proc.stdin;
  if (!stdin) return { output: "оболочка недоступна", timedOut: false };

  const result = await new Promise<{ output: string; timedOut: boolean }>((resolve) => {
    const timer = setTimeout(() => {
      // Таймаут: не убиваем сессию — команда могла быть долгой; снимаем ожидание.
      if (s.pending?.marker === marker) s.pending = null;
      resolve({ output: sinceSeq(s, startSeq).replace(new RegExp(`^.*?${cmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\r\n]*\r?\n?`, "s"), "").trimEnd().slice(0, 8000), timedOut: true });
    }, timeoutMs);
    s.pending = {
      marker,
      startSeq,
      timer,
      resolve: (out) => {
        // Сырой вывод как в настоящем терминале: приглашения и эхо команд
        // остаются — это честная картинка работы оболочки.
        resolve({ output: out.trimEnd().slice(0, 8000), timedOut: false });
      },
    };
    stdin.write(`${cmd}\r\n`);
    // Маркер отдельной строкой: выполнится после команды независимо от её кода.
    stdin.write(`echo ${marker}\r\n`);
  });
  return result;
}

/** Прервать текущую команду (аналог Ctrl+C). */
export function shellInterrupt(userId: string): void {
  const s = sessions.get(userId);
  if (!s) return;
  s.proc.stdin?.write("\u0003\r\n");
  if (s.pending) {
    clearTimeout(s.pending.timer);
    s.pending = null;
  }
}

/** Прервать и перезапустить оболочку (панель «Остановить»). */
export async function restartShell(userId: string): Promise<void> {
  const s = sessions.get(userId);
  if (s?.proc.exitCode === null) s.proc.kill();
  sessions.delete(userId);
  await getShellSession(userId);
}
