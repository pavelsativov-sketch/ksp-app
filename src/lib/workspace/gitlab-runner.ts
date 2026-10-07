import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDb, COL } from "@/lib/mongo";

type RunnerFile = { path: string; name: string; content: string };
type RunnerResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  cwd: string;
  files: RunnerFile[];
  sourceVersions: Record<string, number>;
};

const MAX_COMMAND_MS = 90_000;
const MAX_QUEUE_WAIT_MS = 180_000;
const WORKSPACE_PREFIX = "workspace";

function hmacHex(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then((key) => crypto.subtle.sign("HMAC", key, encoder.encode(value)))
    .then((signature) => Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(""));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeProjectId(value: string): string {
  if (!/^\d+$/.test(value) && !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(value)) {
    throw new Error("Некорректный GITLAB_PROJECT_ID");
  }
  return encodeURIComponent(value);
}

/** Executes one shell command in a fresh, isolated GitLab-hosted Linux runner. */
export async function runGitLabCommand(userId: string, command: string, timeoutMs: number): Promise<RunnerResult> {
  const token = process.env.GITLAB_TRIGGER_TOKEN;
  const projectId = process.env.GITLAB_PROJECT_ID;
  const ref = process.env.GITLAB_REF || "main";
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const secret = process.env.AUTH_SECRET;
  if (!token || !projectId || !appUrl || !secret) {
    throw new Error("Linux runner не настроен: задайте GitLab trigger token, project ID и AUTH_SECRET");
  }
  if (!/^[a-f\d]{24}$/i.test(userId)) throw new Error("Некорректный владелец рабочей области");

  const db = await getDb();
  const executions = db.collection(COL.agentRunnerExecutions);
  const executionId = randomUUID();
  const safeTimeout = Math.min(Math.max(timeoutMs, 1000), MAX_COMMAND_MS);
  const expiresAt = new Date(Date.now() + MAX_QUEUE_WAIT_MS + safeTimeout + 15_000);
  const signature = await hmacHex(`${executionId}\n${userId}\n${expiresAt.getTime()}`, secret);
  await executions.insertOne({
    execution_id: executionId,
    user_id: new ObjectId(userId),
    command,
    timeout_ms: safeTimeout,
    status: "queued",
    created_at: new Date(),
    expires_at: expiresAt,
  });

  try {
    const triggerUrl = new URL(`https://gitlab.com/api/v4/projects/${safeProjectId(projectId)}/trigger/pipeline`);
    triggerUrl.searchParams.set("token", token);
    triggerUrl.searchParams.set("ref", ref);
    const trigger = await fetch(triggerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: {
        runner_execution_id: executionId,
        runner_user_id: userId,
        runner_expires_at: String(expiresAt.getTime()),
        runner_signature: signature,
        runner_app_url: appUrl,
      } }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!trigger.ok) {
      const detail = (await trigger.text()).slice(0, 500);
      throw new Error(`GitLab не принял задачу (${trigger.status}): ${detail}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitLab trigger failed";
    await executions.updateOne({ execution_id: executionId }, { $set: { status: "failed", error: message.replaceAll(token, "[redacted]").slice(0, 500) } });
    throw error;
  }

  const deadline = Math.min(Date.now() + MAX_QUEUE_WAIT_MS + safeTimeout, expiresAt.getTime());
  while (Date.now() < deadline) {
    const execution = await executions.findOne({ execution_id: executionId, user_id: new ObjectId(userId) });
    if (execution?.status === "completed" && execution.result) {
      await executions.deleteOne({ execution_id: executionId });
      return { ...(execution.result as RunnerResult), sourceVersions: (execution.source_versions || {}) as Record<string, number> };
    }
    if (execution?.status === "failed") {
      await executions.deleteOne({ execution_id: executionId });
      throw new Error(typeof execution.error === "string" ? execution.error : "Linux runner не выполнил команду");
    }
    await delay(1500);
  }
  await executions.updateOne({ execution_id: executionId, status: { $in: ["queued", "running"] } }, { $set: { status: "failed", error: "Истёк лимит ожидания GitLab Shared Runner" } });
  await executions.deleteOne({ execution_id: executionId });
  throw new Error("GitLab Shared Runner не начал или не завершил команду вовремя. Попробуйте ещё раз.");
}

export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function verifyRunnerClaim(executionId: string, userId: string, expiresAt: number, signature: string): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !/^[0-9a-f-]{36}$/i.test(executionId) || !/^[a-f\d]{24}$/i.test(userId)
    || !Number.isSafeInteger(expiresAt) || expiresAt < Date.now() || expiresAt > Date.now() + 10 * 60_000) return false;
  return constantTimeEqual(signature, await hmacHex(`${executionId}\n${userId}\n${expiresAt}`, secret));
}

export function validateRunnerWorkspace(files: unknown): files is RunnerFile[] {
  if (!Array.isArray(files) || files.length > 500) return false;
  let total = 0;
  for (const file of files) {
    if (!file || typeof file !== "object") return false;
    const row = file as Partial<RunnerFile>;
    if (typeof row.path !== "string" || !/^workspace(?:\/[^/\\\u0000-\u001f]{1,200})*$/.test(row.path)
      || row.path.split("/").some((part) => part === "." || part === "..")
      || typeof row.name !== "string" || !/^[^/\\\u0000-\u001f]{1,200}$/.test(row.name)
      || row.name === "." || row.name === ".." || typeof row.content !== "string") return false;
    total += Buffer.byteLength(row.content, "utf8");
    if (total > 2_000_000) return false;
  }
  return true;
}

export function workspacePath(name: string): { path: string; name: string } | null {
  const normalized = name.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/");
  if (!normalized || segments.some((part) => !part || part === "." || part === ".." || part.length > 200 || /[\u0000-\u001f]/.test(part))) return null;
  const file = segments.pop()!;
  return { path: segments.length ? `${WORKSPACE_PREFIX}/${segments.join("/")}` : WORKSPACE_PREFIX, name: file };
}
