/** L4: учётные данные агента принимаются только строками разумной длины. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const save = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({ requireApiAuth: async () => ({ user: { id: "a".repeat(24) } }) }));
vi.mock("@/lib/agents/browser-autologin", () => ({
  saveCredentials: save,
  deleteCredentials: vi.fn(),
  listCredentialDomains: vi.fn(),
  KNOWN_LOGIN_SITES: {},
}));

import { POST } from "@/app/api/agents/browser-credentials/route";

const post = (body: unknown) => POST(new Request("http://x/api/agents/browser-credentials", {
  method: "POST",
  body: JSON.stringify(body),
}));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/agents/browser-credentials", () => {
  it("сохраняет нормализованный домен", async () => {
    const res = await post({ domain: " WWW.BilimClass.kz ", username: " teacher ", password: "secret" });
    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalledWith("a".repeat(24), "bilimclass.kz", "teacher", "secret");
  });

  it.each([
    [{ domain: 42, username: "u", password: "p" }],
    [{ domain: "a.kz", username: ["u"], password: "p" }],
    [{ domain: "a.kz", username: "u", password: { $gt: "" } }],
    [{ domain: "a.kz", username: "u", password: "" }],
    [{ domain: "a.kz", username: "u".repeat(257), password: "p" }],
    [{ domain: "a.kz", username: "u", password: "p".repeat(1025) }],
    [{ domain: `${"d".repeat(254)}`, username: "u", password: "p" }],
    [null],
  ])("400 на некорректное тело %j", async (body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });
});
