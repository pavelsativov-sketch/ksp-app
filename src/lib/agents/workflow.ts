import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

export interface AgentTaskPayload {
  taskId: string;
  userId: string;
  prompt: string;
}

interface AgentWorkflowEnv {
  APP_URL?: string;
  AUTH_SECRET?: string;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

export class AgentTaskWorkflow extends WorkflowEntrypoint<AgentWorkflowEnv, AgentTaskPayload> {
  async run(event: WorkflowEvent<AgentTaskPayload>, step: WorkflowStep) {
    const { taskId, userId, prompt } = event.payload;
    if (!/^[a-f\d]{24}$/i.test(taskId) || !/^[a-f\d]{24}$/i.test(userId) || typeof prompt !== "string" || prompt.length > 4000) {
      throw new Error("Некорректные данные задачи агента");
    }

    await step.do(
      "execute-agent-task",
      { timeout: "5 minutes", retries: { limit: 0, delay: "1 second" } },
      async () => {
        const appUrl = this.env.APP_URL;
        const authSecret = this.env.AUTH_SECRET;
        if (!appUrl || !authSecret) throw new Error("Workflow не настроен: APP_URL или AUTH_SECRET отсутствует");
        const payload = { taskId, userId, prompt };
        const timestamp = Date.now().toString();
        const signedValue = `${timestamp}\n${taskId}\n${userId}\n${prompt}`;
        const signature = await sign(authSecret, signedValue);
        const response = await fetch(new URL("/api/agents/workflow-execute", appUrl), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Mekty-Workflow-Timestamp": timestamp,
            "X-Mekty-Workflow-Signature": signature,
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Worker не выполнил задачу агента (${response.status})`);
        return await response.json();
      },
    );

    return { taskId };
  }
}
