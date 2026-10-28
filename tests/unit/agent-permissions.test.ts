import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const mock = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/lib/mongo", () => ({
  getDb: mock.getDb,
  COL: {
    agentPolicies: "agent_policies",
    agentPermissionRequests: "agent_permission_requests",
  },
}));

import { alwaysAllows, classifyCommand, requestPermission } from "@/lib/agents/permissions";

const userId = "a".repeat(24);
let requests: Array<Record<string, unknown>>;
let policyAllowAll: boolean;

beforeEach(() => {
  vi.clearAllMocks();
  requests = [];
  policyAllowAll = false;
  mock.getDb.mockResolvedValue({
    collection: (name: string) => {
      if (name === "agent_permission_requests") {
        return {
          insertOne: async (doc: Record<string, unknown>) => {
            requests.push(doc);
            return { insertedId: new ObjectId() };
          },
          // В тестах одобряем сразу: первый поллинг находит "allowed".
          findOne: async () => ({ status: "allowed" }),
          updateOne: async () => ({ modifiedCount: 1 }),
        };
      }
      if (name === "agent_policies") {
        return {
          findOne: async () => (policyAllowAll ? { always_allow_high_risk: true } : null),
          updateOne: async () => ({ modifiedCount: 1 }),
        };
      }
      throw new Error("unexpected collection");
    },
  });
});

describe("classifyCommand", () => {
  it("классифицирует безопасные команды как low", () => {
    expect(classifyCommand("ls -la")).toBe("low");
    expect(classifyCommand("echo hi")).toBe("low");
    expect(classifyCommand("cat /tmp/file")).toBe("low");
    expect(classifyCommand("git status")).toBe("low");
  });

  it("распознаёт обходы гейта как high", () => {
    expect(classifyCommand("python3 -c 'import shutil; shutil.rmtree(\"/\")'")).toBe("high");
    expect(classifyCommand("find / -delete")).toBe("high");
    expect(classifyCommand("chmod -R 777 /tmp/x")).toBe("high");
    expect(classifyCommand("dd if=/dev/zero of=/dev/sda")).toBe("high");
    expect(classifyCommand("perl -e 'unlink qw(a b)'")).toBe("high");
    expect(classifyCommand("rm -rf /tmp")).toBe("high");
  });

  it("всё, что не в явном LOW-списке, — минимум medium", () => {
    expect(classifyCommand("npm install")).toBe("medium");
    expect(classifyCommand("curl https://example.com")).toBe("high");
    expect(classifyCommand("tar -xzf archive.tgz")).toBe("medium");
  });
});

describe("requestPermission", () => {
  it("low-риск выполняется без запроса разрешения", async () => {
    await expect(requestPermission(userId, "ls", "low")).resolves.toBe(true);
    expect(requests).toHaveLength(0);
  });

  it("medium-риск создаёт запрос разрешения и ждёт одобрения", async () => {
    await expect(requestPermission(userId, "npm install", "medium")).resolves.toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      user_id: new ObjectId(userId),
      risk: "medium",
      status: "pending",
    });
  });

  it("high-риск тоже требует явного одобрения", async () => {
    await expect(requestPermission(userId, "rm -rf /tmp", "high")).resolves.toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ risk: "high" });
  });

  it("почти-allow снимает подтверждения", async () => {
    policyAllowAll = true;
    await expect(requestPermission(userId, "rm -rf /tmp", "high")).resolves.toBe(true);
    expect(requests).toHaveLength(0);
  });

  it("просроченный almost-allow больше не действует", async () => {
    policyAllowAll = true;
    // Реальная политика хранит expires_at; мок возвращает просроченное значение.
    mock.getDb.mockResolvedValue({
      collection: (name: string) => {
        if (name === "agent_permission_requests") {
          return {
            insertOne: async (doc: Record<string, unknown>) => {
              requests.push(doc);
              return { insertedId: new ObjectId() };
            },
            findOne: async () => ({ status: "allowed" }),
            updateOne: async () => ({ modifiedCount: 1 }),
          };
        }
        return {
          findOne: async () => ({
            always_allow_high_risk: true,
            always_allow_expires_at: new Date(Date.now() - 1000),
          }),
          updateOne: async () => ({ modifiedCount: 1 }),
        };
      },
    });
    await expect(alwaysAllows(userId)).resolves.toBe(false);
    // Раз почти-allow истёк — высокий риск снова требует подтверждения.
    await expect(requestPermission(userId, "rm -rf /tmp", "high")).resolves.toBe(true);
    expect(requests).toHaveLength(1);
  });
});
