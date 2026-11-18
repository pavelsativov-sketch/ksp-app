import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { getDb, COL } from "@/lib/mongo";
import type { Sandbox } from "@vercel/sandbox";
import { getWorkspaceTarget, workspaceUnavailableMessage } from "@/lib/agents/runtime-mode";
import { ROOT, MAX_FILE_BYTES, splitFileName } from "./paths";

export { MAX_FILE_BYTES, splitFileName };

const MAX_SNAPSHOT_BYTES = 2_000_000;
const MAX_SNAPSHOTS = 10;

interface WorkspaceFileDoc {
  user_id: string;
  path: string;
  name: string;
  content: string;
  size_bytes?: number;
  created_at: Date;
  updated_at: Date;
}

interface SavedSnapshot {
  user_id: string;
  id: string;
  files: Array<Pick<WorkspaceFileDoc, "path" | "name" | "content">>;
  created_at: Date;
}

function validateOwner(userId: string): void {
  if (!/^[a-f\d]{24}$/i.test(userId)) throw new Error("Некорректный пользователь рабочей области");
}

const WORKSPACE_ROOT = "/vercel/sandbox/workspace";
const SANDBOX_TIMEOUT_MS = 15 * 60_000;
const COMMAND_TIMEOUT_MS = 90_000;

/**
 * Регион песочницы.
 *
 * По умолчанию Vercel кладёт песочницу в iad1 (США), а функции проекта живут
 * в bom1 — из vercel.json. Каждое действие учителя в браузере ОС идёт по кругу
 * «браузер → функция в bom1 → песочница в iad1 → Chromium → кадр назад», то
 * есть через Атлантику дважды. На замере это давало ~2 секунды на кадр, и
 * ввод пароля ощущался как «тупит». Ставим песочницу рядом с функциями.
 *
 * Меняется переменной окружения, если развёртывание переедет.
 */
const SANDBOX_REGION = (process.env.SANDBOX_REGION ?? "bom1") as "bom1";

function usesVercelSandbox(): boolean {
  return getWorkspaceTarget() === "vercel-sandbox";
}

/**
 * Имя песочницы включает регион.
 *
 * Песочница восстанавливается из своего снапшота, а снапшот хранит регион
 * создания. Поэтому песочница, однажды поднятая в iad1, возвращалась туда же
 * и после смены SANDBOX_REGION — getOrCreate находил её по имени и молча
 * игнорировал новый регион. Регион в имени заставляет сменить регион значит
 * поднять действительно новую песочницу.
 */
function sandboxName(userId: string): string {
  const suffix = createHash("sha256").update(userId).digest("hex").slice(0, 32);
  return `mekty-ws-${SANDBOX_REGION}-${suffix}`;
}

const SANDBOX_CACHE_TTL_MS = 60_000;
const sandboxHandleCache = new Map<string, { sandbox: Sandbox; at: number }>();

/** Best-effort cleanup for the persistent VM when the account is deleted. */
export async function deleteAccountWorkspaceSandbox(userId: string): Promise<void> {
  validateOwner(userId);
  sandboxHandleCache.delete(userId);
  if (!usesVercelSandbox()) return;
  const { Sandbox: VercelSandbox } = await import("@vercel/sandbox");
  try {
    const sandbox = await VercelSandbox.get({ name: sandboxName(userId) });
    await sandbox.delete({ deleteOrphanSnapshots: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (!/not.?found|404/i.test(message)) throw error;
  }
}

export async function getAccountSandbox(userId: string): Promise<Sandbox> {
  validateOwner(userId);
  if (!usesVercelSandbox()) throw new Error(workspaceUnavailableMessage());
  const bypassCache = Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";
  if (!bypassCache) {
    const cached = sandboxHandleCache.get(userId);
    if (cached && Date.now() - cached.at < SANDBOX_CACHE_TTL_MS) {
      return cached.sandbox;
    }
  }
  const files = await ownedFiles(userId);
  const { Sandbox: VercelSandbox } = await import("@vercel/sandbox");
  let sandbox = await VercelSandbox.getOrCreate({
    name: sandboxName(userId),
    image: "vercel/sandbox/universal",
    region: SANDBOX_REGION,
    ports: [3000],
    persistent: true,
    timeout: SANDBOX_TIMEOUT_MS,
    resources: { vcpus: 1 },
    keepLastSnapshots: { count: 1 },
    onCreate: async (created) => {
      // Import the account's pre-existing Mongo workspace exactly once when
      // switching its runtime to Vercel Sandbox.
      const legacy = await files.find({ user_id: userId, path: { $regex: "^workspace(?:/|$)" } }, { projection: { path: 1, name: 1, content: 1 } }).limit(500).toArray();
      const totalBytes = legacy.reduce((sum, row) => sum + Buffer.byteLength(row.content, "utf8"), 0);
      if (totalBytes > 20_000_000) throw new Error("Старые файлы рабочей области больше 20 МБ; сократите их перед переносом в Linux-среду");
      for (const row of legacy) {
        const relative = `${row.path === ROOT ? "" : `${row.path.slice(ROOT.length + 1)}/`}${row.name}`;
        const target = sandboxPath(relative);
        await created.fs.mkdir(target.slice(0, target.lastIndexOf("/")), { recursive: true });
        await created.fs.writeFile(target, row.content, "utf8");
      }
    },
  });

  // Если песочница была создана ранее без открытого порта 3000 — пересоздаём её с портом
  const hasPort3000 = (sandbox as unknown as { routes?: Array<{ port: number }> }).routes?.some((r) => r.port === 3000);
  if (!hasPort3000) {
    // Экспорт выполняем до delete. Если среда не отвечает или места слишком
    // много, прерываемся с понятной ошибкой и оставляем старую среду целой.
    const existingFiles = await exportSandboxWorkspace(sandbox);
    try {
      await sandbox.delete({ deleteOrphanSnapshots: true });
    } catch {}
    sandbox = await VercelSandbox.create({
      name: sandboxName(userId),
      image: "vercel/sandbox/universal",
      region: SANDBOX_REGION,
      ports: [3000],
      persistent: true,
      timeout: SANDBOX_TIMEOUT_MS,
      resources: { vcpus: 1 },
      keepLastSnapshots: { count: 1 },
    });
    await sandbox.fs.mkdir(WORKSPACE_ROOT, { recursive: true });
    await importSandboxWorkspace(sandbox, existingFiles);
  }

  await sandbox.fs.mkdir(WORKSPACE_ROOT, { recursive: true });
  if (!bypassCache) {
    sandboxHandleCache.set(userId, { sandbox, at: Date.now() });
  }
  return sandbox;
}

function sandboxPath(filename: string): string {
  const key = splitFileName(filename);
  return `${WORKSPACE_ROOT}/${key.path === ROOT ? "" : `${key.path.slice(ROOT.length + 1)}/`}${key.name}`;
}

type SandboxWorkspaceFile = { relative: string; content: string };

/**
 * Read the user area before replacing an older sandbox configuration.
 *
 * Sandboxes created before port 3000 was added have to be recreated for the
 * browser runner to work. Their filesystem is persistent, but deleting that
 * sandbox without this export would silently discard every file created only
 * in the Linux workspace.
 */
async function exportSandboxWorkspace(sandbox: Sandbox): Promise<SandboxWorkspaceFile[]> {
  const result = await sandbox.runCommand({
    cmd: "find", args: [WORKSPACE_ROOT, "-type", "f", "-print"], cwd: WORKSPACE_ROOT, timeoutMs: 15_000,
  });
  if (result.exitCode !== 0) {
    throw new Error((await result.stderr()).slice(0, 500) || "Не удалось подготовить файлы к обновлению рабочей среды");
  }
  const paths = (await result.stdout()).split("\n").map((item) => item.trim()).filter(Boolean);
  if (paths.length > 500) throw new Error("В рабочей области больше 500 файлов; сократите их перед обновлением среды");
  const files: SandboxWorkspaceFile[] = [];
  let bytes = 0;
  for (const absolute of paths) {
    if (!absolute.startsWith(`${WORKSPACE_ROOT}/`)) continue;
    const content = await sandbox.fs.readFile(absolute, "utf8");
    bytes += Buffer.byteLength(content, "utf8");
    if (bytes > 20_000_000) throw new Error("Файлы рабочей области больше 20 МБ; сократите их перед обновлением среды");
    files.push({ relative: absolute.slice(WORKSPACE_ROOT.length + 1), content });
  }
  return files;
}

async function importSandboxWorkspace(sandbox: Sandbox, files: SandboxWorkspaceFile[]): Promise<void> {
  for (const file of files) {
    const target = `${WORKSPACE_ROOT}/${file.relative}`;
    await sandbox.fs.mkdir(target.slice(0, target.lastIndexOf("/")), { recursive: true });
    await sandbox.fs.writeFile(target, file.content, "utf8");
  }
}

function isMissingSandboxPath(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not.?found|enoent|404/i.test(message);
}

async function makeVercelRuntime(userId: string) {
  const db = await getDb();
  const snapshots = db.collection<SavedSnapshot>(COL.workspaceSnapshots);
  const sandbox = await getAccountSandbox(userId);

  async function readWorkspaceFiles() {
    const result = await sandbox.runCommand({
      cmd: "find", args: [WORKSPACE_ROOT, "-type", "f", "-print"], cwd: WORKSPACE_ROOT, timeoutMs: 15_000,
    });
    if (result.exitCode !== 0) throw new Error((await result.stderr()).slice(0, 500) || "Не удалось прочитать список файлов");
    const paths = (await result.stdout())
      .split("\n")
      .map((path) => path.trim())
      .filter((path) => path.startsWith(`${WORKSPACE_ROOT}/`))
      .slice(0, 500);
    const rows: Array<Pick<WorkspaceFileDoc, "path" | "name" | "content"> & { updated_at: Date }> = [];
    for (let i = 0; i < paths.length; i += 8) {
      const batch = paths.slice(i, i + 8);
      const settled = await Promise.all(
        batch.map(async (absolutePath) => {
          const relative = absolutePath.slice(WORKSPACE_ROOT.length + 1);
          const key = splitFileName(relative);
          const [content, stat] = await Promise.all([
            sandbox.fs.readFile(absolutePath, "utf8"),
            sandbox.fs.stat(absolutePath).catch(() => null),
          ]);
          return { ...key, content, updated_at: stat?.mtime ?? new Date() };
        }),
      );
      rows.push(...settled);
    }
    return rows;
  }

  return {
    async writeFile(filename: string, content: string): Promise<void> {
      if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) throw new Error("Файл больше 200 КБ");
      const target = sandboxPath(filename);
      await sandbox.fs.mkdir(target.slice(0, target.lastIndexOf("/")), { recursive: true });
      await sandbox.fs.writeFile(target, content, "utf8");
    },
    async readFile(filename: string): Promise<string> {
      try { return await sandbox.fs.readFile(sandboxPath(filename), "utf8"); }
      catch { throw new Error("Файл не найден"); }
    },
    async listFiles(): Promise<Array<{ name: string; size: number; modified: string }>> {
      const result = await sandbox.runCommand({
        cmd: "find",
        args: [WORKSPACE_ROOT, "-maxdepth", "4", "-type", "f", "-printf", "%s\\t%T@\\t%P\\n"],
        cwd: WORKSPACE_ROOT,
        timeoutMs: 15_000,
      }).catch(() => null);
      if (result && result.exitCode === 0) {
        const out: Array<{ name: string; size: number; modified: string }> = [];
        for (const rawLine of (await result.stdout()).split("\n")) {
          const line = rawLine.trim();
          if (!line) continue;
          const tab1 = line.indexOf("\t");
          const tab2 = tab1 >= 0 ? line.indexOf("\t", tab1 + 1) : -1;
          if (tab1 <= 0 || tab2 <= tab1) continue;
          const size = Number(line.slice(0, tab1));
          const epochSec = Number(line.slice(tab1 + 1, tab2));
          const relative = line.slice(tab2 + 1);
          if (!relative) continue;
          try {
            const key = splitFileName(relative);
            const name = `${key.path === ROOT ? "" : `${key.path.slice(ROOT.length + 1)}/`}${key.name}`;
            out.push({
              name,
              size: Number.isFinite(size) && size >= 0 ? size : 0,
              modified: Number.isFinite(epochSec) && epochSec > 0
                ? new Date(epochSec * 1000).toISOString()
                : new Date().toISOString(),
            });
            if (out.length >= 500) break;
          } catch {
            // пропускаем небезопасные имена
          }
        }
        return out;
      }

      // Запасной путь, если find не поддерживает -printf: читаем только stat без содержимого.
      const fallback = await sandbox.runCommand({
        cmd: "find", args: [WORKSPACE_ROOT, "-maxdepth", "4", "-type", "f", "-print"], cwd: WORKSPACE_ROOT, timeoutMs: 15_000,
      });
      if (fallback.exitCode !== 0) throw new Error((await fallback.stderr()).slice(0, 500) || "Не удалось прочитать список файлов");
      const paths = (await fallback.stdout())
        .split("\n")
        .map((path) => path.trim())
        .filter((path) => path.startsWith(`${WORKSPACE_ROOT}/`))
        .slice(0, 500);
      const out: Array<{ name: string; size: number; modified: string }> = [];
      for (let i = 0; i < paths.length; i += 8) {
        const batch = paths.slice(i, i + 8);
        const stats = await Promise.all(
          batch.map(async (absolutePath) => {
            const relative = absolutePath.slice(WORKSPACE_ROOT.length + 1);
            const key = splitFileName(relative);
            const stat = await sandbox.fs.stat(absolutePath).catch(() => null);
            return {
              name: `${key.path === ROOT ? "" : `${key.path.slice(ROOT.length + 1)}/`}${key.name}`,
              size: typeof (stat as { size?: number } | null)?.size === "number" ? (stat as { size: number }).size : 0,
              modified: (stat?.mtime ?? new Date()).toISOString(),
            };
          }),
        );
        out.push(...stats);
      }
      return out;
    },
    async deleteFile(filename: string): Promise<void> {
      try { await sandbox.fs.unlink(sandboxPath(filename)); }
      catch { throw new Error("Файл не найден"); }
    },
    /**
     * Rename inside the sandbox instead of round-tripping content through the
     * browser.  Besides being much faster, this keeps files larger than the
     * preview limit intact.
     */
    async renameFile(from: string, to: string): Promise<void> {
      const source = sandboxPath(from);
      const target = sandboxPath(to);
      if (source === target) return;
      try { await sandbox.fs.access(source); }
      catch (error) {
        if (isMissingSandboxPath(error)) throw new Error("Файл не найден");
        throw new Error("Не удалось проверить исходный файл");
      }
      let targetExists = false;
      try {
        await sandbox.fs.access(target);
        targetExists = true;
      } catch (error) {
        // access() rejects when the destination does not exist, which is the
        // only case in which moving without replacing data is safe. Other
        // filesystem failures must never be mistaken for a missing file.
        if (!isMissingSandboxPath(error)) throw new Error("Не удалось проверить новое имя файла");
      }
      if (targetExists) throw new Error("Файл с таким именем уже существует");
      await sandbox.fs.mkdir(target.slice(0, target.lastIndexOf("/")), { recursive: true });
      try { await sandbox.fs.rename(source, target); }
      catch { throw new Error("Не удалось переименовать файл"); }
    },
    async runCommand(command: string, timeoutMs = COMMAND_TIMEOUT_MS) {
      const safeTimeout = Math.min(Math.max(timeoutMs, 1000), COMMAND_TIMEOUT_MS);
      const result = await sandbox.runCommand({
        cmd: "bash", args: ["-lc", command], cwd: WORKSPACE_ROOT, timeoutMs: safeTimeout,
      });
      return {
        exitCode: result.exitCode,
        stdout: (await result.stdout()).slice(0, 18_000),
        stderr: (await result.stderr()).slice(0, 8_000),
        cwd: WORKSPACE_ROOT,
      };
    },
    async getSandboxStatus() {
      return { available: true, status: sandbox.status, cwd: WORKSPACE_ROOT, timeoutMs: SANDBOX_TIMEOUT_MS, vcpus: sandbox.vcpus ?? 1 };
    },
    async listSnapshots(): Promise<Array<{ id: string; createdAt: string }>> {
      const rows = await snapshots.find({ user_id: userId, id: { $not: /^rollback-/ } }, { projection: { id: 1, created_at: 1 } })
        .sort({ created_at: -1 }).limit(MAX_SNAPSHOTS).toArray();
      return rows.map((row) => ({ id: row.id, createdAt: row.created_at.toISOString() }));
    },
    async createSnapshot(): Promise<{ id: string; createdAt: string }> {
      const rows = await readWorkspaceFiles();
      const bytes = rows.reduce((sum, row) => sum + Buffer.byteLength(row.content, "utf8"), 0);
      if (bytes > MAX_SNAPSHOT_BYTES) throw new Error("Снимок больше 2 МБ; удалите крупные файлы и повторите");
      const createdAt = new Date();
      const id = `${createdAt.toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
      await snapshots.insertOne({ user_id: userId, id, files: rows.map(({ path, name, content }) => ({ path, name, content })), created_at: createdAt });
      const stale = await snapshots.find({ user_id: userId, id: { $not: /^rollback-/ } }).sort({ created_at: -1 }).skip(MAX_SNAPSHOTS).project({ _id: 1 }).toArray();
      if (stale.length) await snapshots.deleteMany({ _id: { $in: stale.map((row) => row._id) } });
      return { id, createdAt: createdAt.toISOString() };
    },
    async restoreSnapshot(id: string): Promise<void> {
      const selected = await snapshots.findOne({ user_id: userId, id });
      if (!selected) throw new Error("Снимок рабочей области не найден");
      const current = await readWorkspaceFiles();
      const bytes = current.reduce((sum, row) => sum + Buffer.byteLength(row.content, "utf8"), 0);
      if (bytes > MAX_SNAPSHOT_BYTES) throw new Error("Текущая рабочая область больше 2 МБ; очистите её перед восстановлением");
      await snapshots.insertOne({ user_id: userId, id: `rollback-${randomUUID()}`, files: current.map(({ path, name, content }) => ({ path, name, content })), created_at: new Date() });
      await sandbox.fs.rm(WORKSPACE_ROOT, { recursive: true, force: true });
      await sandbox.fs.mkdir(WORKSPACE_ROOT, { recursive: true });
      for (const file of selected.files) {
        const target = `${WORKSPACE_ROOT}/${file.path === ROOT ? "" : `${file.path.slice(ROOT.length + 1)}/`}${file.name}`;
        await sandbox.fs.mkdir(target.slice(0, target.lastIndexOf("/")), { recursive: true });
        await sandbox.fs.writeFile(target, file.content, "utf8");
      }
    },
  };
}

async function ownedFiles(userId: string) {
  validateOwner(userId);
  return (await getDb()).collection<WorkspaceFileDoc>(COL.workspaceFiles);
}

/** Persistent account workspace stored in the application's MongoDB database. */
export async function getWorkspaceRuntime(userId: string) {
  const target = getWorkspaceTarget();
  if (target === "vercel-sandbox") return makeVercelRuntime(userId);
  const files = await ownedFiles(userId);

  return {
    async writeFile(filename: string, content: string): Promise<void> {
      const key = splitFileName(filename);
      const sizeBytes = Buffer.byteLength(content, "utf8");
      if (sizeBytes > MAX_FILE_BYTES) throw new Error("Файл больше 200 КБ");
      const now = new Date();
      await files.updateOne(
        { user_id: userId, path: key.path, name: key.name },
        {
          $set: { content, size_bytes: sizeBytes, updated_at: now },
          $setOnInsert: { user_id: userId, path: key.path, name: key.name, created_at: now },
        },
        { upsert: true },
      );
    },

    async readFile(filename: string): Promise<string> {
      const key = splitFileName(filename);
      const doc = await files.findOne({ user_id: userId, path: key.path, name: key.name }, { projection: { content: 1 } });
      if (!doc) throw new Error("Файл не найден");
      return doc.content;
    },

    async listFiles(): Promise<Array<{ name: string; size: number; modified: string }>> {
      const filter = { user_id: userId, path: { $regex: "^workspace(?:/|$)" } };
      if (typeof (files as unknown as { aggregate?: unknown }).aggregate === "function") {
        try {
          const rows = await files
            .aggregate<{ path: string; name: string; updated_at: Date; size: number }>([
              { $match: filter },
              { $sort: { updated_at: -1 } },
              { $limit: 500 },
              {
                $project: {
                  path: 1,
                  name: 1,
                  updated_at: 1,
                  size: { $ifNull: ["$size_bytes", { $strLenBytes: { $ifNull: ["$content", ""] } }] },
                },
              },
            ])
            .toArray();
          return rows.map((row) => ({
            name: `${row.path === ROOT ? "" : `${row.path.slice(ROOT.length + 1)}/`}${row.name}`,
            size: typeof row.size === "number" ? row.size : 0,
            modified: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
          }));
        } catch {
          // Фолбэк для тестовых БД или сред без поддержки $strLenBytes.
        }
      }
      const rows = await files.find(filter, { projection: { path: 1, name: 1, content: 1, size_bytes: 1, updated_at: 1 } })
        .sort({ updated_at: -1 }).limit(500).toArray();
      return rows.map((row) => ({
        name: `${row.path === ROOT ? "" : `${row.path.slice(ROOT.length + 1)}/`}${row.name}`,
        size: typeof row.size_bytes === "number" ? row.size_bytes : Buffer.byteLength(row.content, "utf8"),
        modified: row.updated_at.toISOString(),
      }));
    },

    async deleteFile(filename: string): Promise<void> {
      const key = splitFileName(filename);
      const result = await files.deleteOne({ user_id: userId, path: key.path, name: key.name });
      if (result.deletedCount !== 1) throw new Error("Файл не найден");
    },

    /**
     * Mongo has no filesystem rename primitive.  Insert the destination first
     * (the unique index rejects collisions), then delete the source.  This
     * ordering never loses a teacher's file if a database operation fails.
     */
    async renameFile(from: string, to: string): Promise<void> {
      const source = splitFileName(from);
      const target = splitFileName(to);
      if (source.path === target.path && source.name === target.name) return;
      const document = await files.findOne({ user_id: userId, path: source.path, name: source.name });
      if (!document) throw new Error("Файл не найден");
      const now = new Date();
      try {
        await files.insertOne({
          user_id: userId,
          path: target.path,
          name: target.name,
          content: document.content,
          created_at: document.created_at,
          updated_at: now,
        });
      } catch (error) {
        if (error instanceof Error && /duplicate|E11000/i.test(error.message)) {
          throw new Error("Файл с таким именем уже существует");
        }
        throw new Error("Не удалось переименовать файл");
      }
      const deleted = await files.deleteOne({ _id: document._id });
      if (deleted.deletedCount === 1) return;
      // Do not leave a surprising duplicate behind if the source vanished in
      // a competing request.  The original content remains recoverable in
      // either case; report the conflict instead of claiming success.
      await files.deleteOne({ user_id: userId, path: target.path, name: target.name, updated_at: now }).catch(() => undefined);
      throw new Error("Файл изменился во время переименования; повторите попытку");
    },

    async runCommand(command: string, timeoutMs = COMMAND_TIMEOUT_MS) {
      void command; void timeoutMs;
      // Команды выполняются только в Linux-среде Vercel Sandbox;
      // Mongo-хранение хранит файлы и снимки, но не исполняет команды.
      throw new Error(workspaceUnavailableMessage());
    },

    async getSandboxStatus() {
      return {
        available: false,
        status: "local-workspace",
        cwd: "/workspace",
        timeoutMs: 0,
        vcpus: 0,
        reason: "Linux-среда не установлена: команды выполняются только на Vercel с Vercel Sandbox.",
      };
    },

    async listSnapshots(): Promise<Array<{ id: string; createdAt: string }>> {
      const rows = await (await getDb()).collection<SavedSnapshot>(COL.workspaceSnapshots)
        .find({ user_id: userId }, { projection: { id: 1, created_at: 1 } })
        .sort({ created_at: -1 }).limit(MAX_SNAPSHOTS).toArray();
      return rows.map((row) => ({ id: row.id, createdAt: row.created_at.toISOString() }));
    },

    async createSnapshot(): Promise<{ id: string; createdAt: string }> {
      const rows = await files.find({ user_id: userId, path: { $regex: "^workspace(?:/|$)" } }, { projection: { path: 1, name: 1, content: 1 } }).limit(500).toArray();
      const bytes = rows.reduce((sum, row) => sum + Buffer.byteLength(row.content, "utf8"), 0);
      if (bytes > MAX_SNAPSHOT_BYTES) throw new Error("Снимок больше 2 МБ; удалите крупные файлы и повторите");
      const createdAt = new Date();
      const id = `${createdAt.toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
      const snapshot: SavedSnapshot = {
        user_id: userId,
        id,
        files: rows.map(({ path, name, content }) => ({ path, name, content })),
        created_at: createdAt,
      };
      const collection = (await getDb()).collection<SavedSnapshot>(COL.workspaceSnapshots);
      await collection.insertOne(snapshot);
      const stale = await collection.find({ user_id: userId }).sort({ created_at: -1 }).skip(MAX_SNAPSHOTS).project({ _id: 1 }).toArray();
      if (stale.length) await collection.deleteMany({ _id: { $in: stale.map((row) => row._id) } });
      return { id, createdAt: createdAt.toISOString() };
    },

    async restoreSnapshot(id: string): Promise<void> {
      const snapshots = (await getDb()).collection<SavedSnapshot>(COL.workspaceSnapshots);
      const selected = await snapshots.findOne({ user_id: userId, id });
      if (!selected) throw new Error("Снимок рабочей области не найден");
      const current = await files.find({ user_id: userId, path: { $regex: "^workspace(?:/|$)" } }, { projection: { _id: 0, path: 1, name: 1, content: 1 } }).toArray();
      const bytes = current.reduce((sum, row) => sum + Buffer.byteLength(row.content, "utf8"), 0);
      if (bytes > MAX_SNAPSHOT_BYTES) throw new Error("Текущая рабочая область больше 2 МБ; очистите её перед восстановлением");
      const rollback: SavedSnapshot = { user_id: userId, id: `rollback-${randomUUID()}`, files: current, created_at: new Date() };
      await snapshots.insertOne(rollback);
      await files.deleteMany({ user_id: userId, path: { $regex: "^workspace(?:/|$)" } });
      if (selected.files.length) {
        const now = new Date();
        await files.insertMany(selected.files.map((file) => ({ ...file, user_id: userId, created_at: now, updated_at: now })));
      }
    },

  };
}
