/**
 * Инварианты скрипта браузерного раннера.
 *
 * Раннер — один процесс на всех учителей. В обработчике ошибки он обращался к
 * `context`, объявленному внутри `try`: при первой же ошибке «Protocol error»
 * (Chromium упал, страница закрылась) возникал ReferenceError, процесс
 * завершался, и «Браузер» оставался мёртвым у всех, пока раннер не перезапустят.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RUNNER_SCRIPT } from "@/lib/agents/sandbox-runner-code";

describe("скрипт раннера", () => {
  it("синтаксически корректен (node --check)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mekty-runner-check-"));
    const file = path.join(dir, "runner.mjs");
    fs.writeFileSync(file, RUNNER_SCRIPT, "utf8");
    try {
      const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("обработчик ошибок не использует переменные из блока try", () => {
    const start = RUNNER_SCRIPT.lastIndexOf("} catch (err) {");
    expect(start).toBeGreaterThan(-1);
    const handler = RUNNER_SCRIPT.slice(start);
    // `context` и `page` объявлены внутри try: в catch они недоступны.
    const stray = handler.match(/(?<![.\w])(?:context|page)\.\w+/g) ?? [];
    expect(stray, `в catch используются недоступные переменные: ${stray.join(", ")}`).toEqual([]);
    expect(handler).toContain("sessions.get(sessionId)");
  });

  it("необработанная ошибка не завершает процесс раннера", () => {
    expect(RUNNER_SCRIPT).toContain('process.on("uncaughtException"');
    expect(RUNNER_SCRIPT).toContain('process.on("unhandledRejection"');
  });
});
