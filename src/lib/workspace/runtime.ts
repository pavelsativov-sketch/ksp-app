import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { getDb, COL } from "@/lib/mongo";
import type { Sandbox } from "@vercel/sandbox";
import { runGitLabCommand } from "@/lib/workspace/gitlab-runner";

const ROOT = "workspace";
const MAX_FILE_BYTES = 200_000;
const MAX_SNAPSHOT_BYTES = 2_000_000;
const MAX_SNAPSHOTS = 10;

interface WorkspaceFileDoc {
  user_id: string;
  path: string;
  name: string;
  content: string;
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

function usesVercelSandbox(): boolean {
  if (process.env.WORKSPACE_RUNTIME === "off") return false;
  return process.env.WORKSPACE_RUNTIME === "vercel-sandbox" || process.env.VERCEL === "1";
}

function sandboxName(userId: string): string {
  const suffix = createHash("sha256").update(userId).digest("hex").slice(0, 32);
  return `mekty-ws-${suffix}`;
}

/** Best-effort cleanup for the persistent VM when the account is deleted. */
export async function deleteAccountWorkspaceSandbox(userId: string): Promise<void> {
  validateOwner(userId);
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

async function getAccountSandbox(userId: string): Promise<Sandbox> {
  validateOwner(userId);
  if (!usesVercelSandbox()) throw new Error("Для Linux-среды разверните приложение на Vercel с включённым Vercel Sandbox");
  const files = await ownedFiles(userId);
  const { Sandbox: VercelSandbox } = await import("@vercel/sandbox");
  const sandbox = await VercelSandbox.getOrCreate({
    name: sandboxName(userId),
    image: "vercel/sandbox/universal",
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
  await sandbox.fs.mkdir(WORKSPACE_ROOT, { recursive: true });
  return sandbox;
}

function sandboxPath(filename: string): string {
  const key = splitFileName(filename);
  return `${WORKSPACE_ROOT}/${key.path === ROOT ? "" : `${key.path.slice(ROOT.length + 1)}/`}${key.name}`;
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
    const paths = (await result.stdout()).split("\n").map((path) => path.trim()).filter(Boolean).slice(0, 500);
    const rows: Array<Pick<WorkspaceFileDoc, "path" | "name" | "content"> & { updated_at: Date }> = [];
    for (const absolutePath of paths) {
      if (!absolutePath.startsWith(`${WORKSPACE_ROOT}/`)) continue;
      const relative = absolutePath.slice(WORKSPACE_ROOT.length + 1);
      const content = await sandbox.fs.readFile(absolutePath, "utf8");
      const key = splitFileName(relative);
      let updatedAt = new Date();
      try { updatedAt = (await sandbox.fs.stat(absolutePath)).mtime; } catch { /* свежесозданный файл */ }
      rows.push({ ...key, content, updated_at: updatedAt });
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
      return (await readWorkspaceFiles()).map((row) => ({
        name: `${row.path === ROOT ? "" : `${row.path.slice(ROOT.length + 1)}/`}${row.name}`,
        size: Buffer.byteLength(row.content, "utf8"),
        modified: row.updated_at.toISOString(),
      }));
    },
    async deleteFile(filename: string): Promise<void> {
      try { await sandbox.fs.unlink(sandboxPath(filename)); }
      catch { throw new Error("Файл не найден"); }
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

function splitFileName(input: string): { path: string; name: string } {
  const normalized = input.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/");
  if (!normalized || normalized.length > 1000 || segments.some((part) => !part || part === "." || part === ".." || part.length > 200)) {
    throw new Error("Некорректный путь файла");
  }
  const name = segments.pop()!;
  return { path: segments.length ? `${ROOT}/${segments.join("/")}` : ROOT, name };
}

async function ownedFiles(userId: string) {
  validateOwner(userId);
  return (await getDb()).collection<WorkspaceFileDoc>(COL.workspaceFiles);
}

/**
 * Возвращает raw Vercel Sandbox для использования браузером агента.
 * Возвращает null если Vercel Sandbox не настроен (локальная разработка,
 * Cloudflare Workers или другие среды).
 */
export async function getVercelSandbox(userId: string): Promise<unknown> {
  if (!usesVercelSandbox()) return null;
  return getAccountSandbox(userId);
}

/** Persistent account workspace stored in the application's MongoDB database. */
export async function getWorkspaceRuntime(userId: string) {
  if (usesVercelSandbox()) return makeVercelRuntime(userId);
  const files = await ownedFiles(userId);

  return {
    async writeFile(filename: string, content: string): Promise<void> {
      const key = splitFileName(filename);
      if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) throw new Error("Файл больше 200 КБ");
      const now = new Date();
      await files.updateOne(
        { user_id: userId, path: key.path, name: key.name },
        { $set: { content, updated_at: now }, $setOnInsert: { user_id: userId, path: key.path, name: key.name, created_at: now } },
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
      const rows = await files.find({ user_id: userId, path: { $regex: "^workspace(?:/|$)" } }, { projection: { path: 1, name: 1, content: 1, updated_at: 1 } })
        .sort({ updated_at: -1 }).limit(500).toArray();
      return rows.map((row) => ({
        name: `${row.path === ROOT ? "" : `${row.path.slice(ROOT.length + 1)}/`}${row.name}`,
        size: Buffer.byteLength(row.content, "utf8"),
        modified: row.updated_at.toISOString(),
      }));
    },

    async deleteFile(filename: string): Promise<void> {
      const key = splitFileName(filename);
      const result = await files.deleteOne({ user_id: userId, path: key.path, name: key.name });
      if (result.deletedCount !== 1) throw new Error("Файл не найден");
    },

    async runCommand(command: string, timeoutMs = COMMAND_TIMEOUT_MS) {
      const safeTimeout = Math.min(Math.max(timeoutMs, 1000), COMMAND_TIMEOUT_MS);
      const result = await runGitLabCommand(userId, command, safeTimeout);
      const existing = await files.find(
        { user_id: userId, path: { $regex: "^workspace(?:/|$)" } },
        { projection: { _id: 0, path: 1, name: 1, updated_at: 1 } },
      ).limit(500).toArray();
      const currentByKey = new Map(existing.map((file) => [`${file.path}\n${file.name}`, file]));
      const nextKeys = new Set(result.files.map((file) => `${file.path}\n${file.name}`));
      const unchanged = (key: string) => {
        const baseline = result.sourceVersions[key];
        const current = currentByKey.get(key);
        return baseline === undefined ? !current : !!current && current.updated_at?.getTime() === baseline;
      };
      const removals = existing.filter((file) => {
        const key = `${file.path}\n${file.name}`;
        return !nextKeys.has(key) && result.sourceVersions[key] !== undefined && unchanged(key);
      });
      if (removals.length) {
        await files.deleteMany({ user_id: userId, $or: removals.map(({ path, name }) => ({ path, name })) });
      }
      const safeFiles = result.files.filter((file) => unchanged(`${file.path}\n${file.name}`));
      if (safeFiles.length) {
        const now = new Date();
        await files.bulkWrite(safeFiles.map((file) => ({
          updateOne: {
            filter: { user_id: userId, path: file.path, name: file.name },
            update: { $set: { content: file.content, updated_at: now }, $setOnInsert: { user_id: userId, path: file.path, name: file.name, created_at: now } },
            upsert: true,
          },
        })));
      }
      return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, cwd: result.cwd };
    },

    async getSandboxStatus() {
      const available = Boolean(process.env.GITLAB_TRIGGER_TOKEN && process.env.GITLAB_PROJECT_ID && process.env.APP_URL && process.env.AUTH_SECRET);
      return {
        available,
        status: available ? "gitlab-shared-runner" : "runner-not-configured",
        cwd: "/workspace",
        timeoutMs: available ? COMMAND_TIMEOUT_MS : 0,
        vcpus: available ? 2 : 0,
        reason: available ? undefined : "Linux runner не настроен. Нужны GitLab trigger token, project ID, APP_URL и AUTH_SECRET.",
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
