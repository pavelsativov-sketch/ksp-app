/**
 * H2: лимит новых Linux-сред проверяется только перед созданием среды,
 * а подключение к уже существующей его не тратит.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  getOrCreate: vi.fn(),
}));

vi.mock("@vercel/sandbox", () => ({ Sandbox: { get: mock.get, getOrCreate: mock.getOrCreate } }));
vi.mock("@/lib/agents/runtime-mode", () => ({
  getWorkspaceTarget: () => "vercel-sandbox",
  workspaceUnavailableMessage: () => "нет среды",
}));
vi.mock("@/lib/mongo", () => ({
  COL: { workspaceFiles: "workspace_files" },
  getDb: async () => ({ collection: () => ({}) }),
}));

import { getAccountSandbox } from "@/lib/workspace/runtime";

const userId = "c".repeat(24);
const sandbox = { routes: [{ port: 3000 }], fs: { mkdir: vi.fn() } };
const notFound = Object.assign(new Error("not found"), { response: { status: 404 } });

beforeEach(() => {
  vi.clearAllMocks();
  mock.getOrCreate.mockResolvedValue(sandbox);
});

describe("getAccountSandbox: beforeCreate", () => {
  it("не вызывается, если среда уже есть", async () => {
    mock.get.mockResolvedValue(sandbox);
    const beforeCreate = vi.fn(async () => {});
    await getAccountSandbox(userId, { beforeCreate });
    expect(beforeCreate).not.toHaveBeenCalled();
  });

  it("вызывается перед созданием новой среды и может её запретить", async () => {
    mock.get.mockRejectedValue(notFound);
    const beforeCreate = vi.fn(async () => { throw new Error("лимит"); });
    await expect(getAccountSandbox(userId, { beforeCreate })).rejects.toThrow("лимит");
    expect(mock.getOrCreate).not.toHaveBeenCalled();
  });

  it("без хука поведение прежнее: сразу getOrCreate", async () => {
    await getAccountSandbox(userId);
    expect(mock.get).not.toHaveBeenCalled();
    expect(mock.getOrCreate).toHaveBeenCalledOnce();
  });
});
