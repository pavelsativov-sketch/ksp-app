/** Describe app-provided workspace features without reporting host-machine resources as a user VM. */
export async function sysInfo(): Promise<string> {
  if (process.env.WORKSPACE_RUNTIME !== "off" && (process.env.WORKSPACE_RUNTIME === "vercel-sandbox" || process.env.VERCEL === "1")) {
    return "Облачная рабочая область · файлы аккаунта · изолированная Linux Sandbox (до 15 минут)";
  }
  return "Облачная рабочая область · файлы аккаунта · Linux-среда выполнения не настроена";
}
