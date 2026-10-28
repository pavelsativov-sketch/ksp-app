import { describe, expect, it } from "vitest";
import {
  agentRuntimeProblems,
  getAgentRuntimeMode,
  getBrowserTarget,
  getWorkspaceTarget,
  isVercelEnvironment,
  workspaceUnavailableMessage,
} from "@/lib/agents/runtime-mode";

describe("ОС агентов работает только в Vercel Sandbox", () => {
  it("на Vercel и рабочая область, и браузер — песочница", () => {
    expect(getWorkspaceTarget({ VERCEL: "1" })).toBe("vercel-sandbox");
    expect(getBrowserTarget({ VERCEL: "1" })).toBe("vercel-sandbox");
    expect(getAgentRuntimeMode()).toBe("vercel");
  });

  it("вне Vercel рабочей области и браузера нет", () => {
    expect(getWorkspaceTarget({})).toBe("none");
    expect(getBrowserTarget({})).toBe("none");
  });

  it("старые переменные локального режима ничего не включают", () => {
    const legacy = {
      AGENT_RUNTIME: "local",
      BROWSER_RPC_URL: "http://127.0.0.1:3111/_agent/browser",
      BROWSER_RPC_SECRET: "x".repeat(40),
      AGENT_LOCAL_RUNNER_URL: "http://127.0.0.1:3111/_agent/browser",
    };
    expect(getWorkspaceTarget(legacy)).toBe("none");
    expect(getBrowserTarget(legacy)).toBe("none");
    // Даже на Vercel старые переменные не меняют режим.
    expect(getWorkspaceTarget({ ...legacy, VERCEL: "1" })).toBe("vercel-sandbox");
    expect(getBrowserTarget({ ...legacy, VERCEL: "1" })).toBe("vercel-sandbox");
  });

  it("WORKSPACE_RUNTIME=off отключает рабочую область даже на Vercel", () => {
    expect(getWorkspaceTarget({ VERCEL: "1", WORKSPACE_RUNTIME: "off" })).toBe("none");
  });

  it("isVercelEnvironment различает окружения", () => {
    expect(isVercelEnvironment({ VERCEL: "1" })).toBe(true);
    expect(isVercelEnvironment({})).toBe(false);
  });
});

describe("проверка настройки сообщает об устаревших переменных", () => {
  it("чистое окружение — без проблем", () => {
    expect(agentRuntimeProblems({ VERCEL: "1", AUTH_SECRET: "x".repeat(40) })).toEqual([]);
  });

  it.each(["AGENT_RUNTIME", "BROWSER_RPC_URL", "BROWSER_RPC_SECRET", "AGENT_LOCAL_RUNNER_URL", "RUNNER_PORT"])(
    "%s больше не поддерживается",
    (name) => {
      const problems = agentRuntimeProblems({ [name]: "value" });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(name);
      expect(problems[0]).toContain("Vercel Sandbox");
    },
  );
});

describe("сообщение, когда рабочей области нет", () => {
  it("вне Vercel честно говорит, что она только в облаке", () => {
    const text = workspaceUnavailableMessage({});
    expect(text).toContain("только на опубликованном сайте");
    expect(text).not.toContain("start-mekty");
    expect(text).not.toContain("dev:local");
  });

  it("на Vercel говорит про настройку Sandbox", () => {
    expect(workspaceUnavailableMessage({ VERCEL: "1" })).toContain("Vercel Sandbox");
  });
});
