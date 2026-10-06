import os from "node:os";
import { promises as fs } from "node:fs";

/**
 * Реальная спецификация окружения для статус-бара рабочей области:
 * платформа, число vCPU, объём RAM и диска. Значения берутся у машины, на
 * которой реально выполняется агент, — выдуманной «Ubuntu 22.04 · 4 vCPU»
 * здесь нет.
 */
export async function sysInfo(): Promise<string> {
  const platform = process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux";
  const cpus = os.cpus().length;
  const ram = Math.max(1, Math.round(os.totalmem() / 1024 ** 3));
  let disk = "";
  try {
    const statfs = fs.statfs as unknown as ((p: string) => Promise<{ blocks: number; bsize: number }>) | undefined;
    if (typeof statfs === "function") {
      const st = await statfs(".").catch(() => undefined);
      if (st?.blocks && st?.bsize) disk = ` · ${Math.round((st.blocks * st.bsize) / 1024 ** 3)} GB SSD`;
    }
  } catch { /* диск неизвестен — не мешает статус-бару */ }
  return `${platform} · ${cpus} vCPU · ${ram} GB RAM${disk}`;
}
