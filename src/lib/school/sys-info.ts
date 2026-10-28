import { getWorkspaceTarget, workspaceUnavailableMessage } from "@/lib/agents/runtime-mode";

/** Describe app-provided workspace features without reporting host-machine resources as a user VM. */
export async function sysInfo(): Promise<string> {
  if (getWorkspaceTarget() === "vercel-sandbox") {
    return "Облачная рабочая область · личный браузер · файлы аккаунта · изолированная Linux Sandbox (до 15 минут)";
  }
  return workspaceUnavailableMessage();
}
