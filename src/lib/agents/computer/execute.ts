import crypto from "crypto";

function base64Url(buffer: Buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export type ExecutorResponse = {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  code?: number | null;
  error?: string;
};

export async function runExecutor(userId: string, command: string, args: string[] = [], timeoutMs = 30000): Promise<ExecutorResponse> {
  const url = process.env.EXECUTOR_URL;
  const secret = process.env.EXECUTOR_AUTH_SECRET;
  if (!url || !secret) return { ok: false, error: "EXECUTOR_URL or EXECUTOR_AUTH_SECRET is not configured" };

  const body = { userId, command, args, timeoutMs };
  const raw = JSON.stringify(body);
  const timestamp = String(Date.now());
  const hmac = crypto.createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest();
  const signature = base64Url(hmac);

  const res = await fetch(new URL("/run", url).toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mekty-timestamp": timestamp,
      "x-mekty-signature": signature,
    },
    body: raw,
  });

  if (!res.ok) {
    try {
      const payload = await res.json();
      return { ok: false, error: payload?.error || `status ${res.status}` };
    } catch {
      return { ok: false, error: `HTTP ${res.status}` };
    }
  }

  try {
    const payload = await res.json();
    return payload as ExecutorResponse;
  } catch (err) {
    return { ok: false, error: "Invalid JSON response from executor" };
  }
}
