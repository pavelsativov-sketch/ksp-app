/**
 * «Стоп» терминала по runId убивает свою команду, а не последнюю из параллельных.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ runCommand: vi.fn() }));

vi.mock("@/lib/api-auth", () => ({ requireApiAuth: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/workspace/runtime", () => ({ getWorkspaceRuntime: async () => ({ runCommand: mock.runCommand }) }));
vi.mock("@/lib/agents/runtime-mode", () => ({ getWorkspaceTarget: () => "local" }));

import { POST as runPOST } from "@/app/api/agents/terminal/route";
import { POST as stopPOST } from "@/app/api/agents/terminal/stop/route";
import { terminalRunId } from "@/lib/agents/terminal-pid";

const post = (url: string, body?: unknown) =>
  new Request(url, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

beforeEach(() => {
  vi.clearAllMocks();
  mock.runCommand.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
});

describe("PID-файл запуска терминала", () => {
  it("пишет PID в файл своего runId и возвращает runId клиенту", async () => {
    const res = await runPOST(post("http://x/api/agents/terminal", { command: "sleep 5", runId: "run-abc-123" }));
    expect((await res.json()).runId).toBe("run-abc-123");
    const command = String(mock.runCommand.mock.calls[0]![0]);
    expect(command).toContain("/tmp/mekty-term-run-abc-123.pid");
    expect(command).toContain("/tmp/mekty-term.pid"); // старый клиент без runId
  });

  it("без runId генерирует свой", async () => {
    const res = await runPOST(post("http://x/api/agents/terminal", { command: "ls" }));
    const { runId } = await res.json();
    expect(terminalRunId(runId)).toBe(runId);
    expect(String(mock.runCommand.mock.calls[0]![0])).toContain(`/tmp/mekty-term-${runId}.pid`);
  });

  it("стоп с runId убивает именно этот запуск", async () => {
    await stopPOST(post("http://x/api/agents/terminal/stop", { runId: "run-abc-123" }));
    const command = String(mock.runCommand.mock.calls[0]![0]);
    expect(command).toContain("/tmp/mekty-term-run-abc-123.pid");
    expect(command).not.toContain("/tmp/mekty-term.pid");
  });

  it("стоп без тела — прежнее поведение (последняя команда)", async () => {
    await stopPOST(post("http://x/api/agents/terminal/stop"));
    expect(String(mock.runCommand.mock.calls[0]![0])).toContain("/tmp/mekty-term.pid");
  });

  it("runId с опасными символами в shell не попадает", async () => {
    expect(terminalRunId("x; rm -rf /")).toBeNull();
    await stopPOST(post("http://x/api/agents/terminal/stop", { runId: "$(reboot)" }));
    expect(String(mock.runCommand.mock.calls[0]![0])).not.toContain("reboot");
  });
});
