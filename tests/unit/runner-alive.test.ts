import { afterEach, describe, expect, it, vi } from "vitest";
import { runnerAlive } from "@/lib/agents/sandbox-browser-service";

const timeout = () => Object.assign(new Error("timed out"), { name: "TimeoutError" });

afterEach(() => vi.unstubAllGlobals());

describe("runnerAlive", () => {
  it("does not call a busy runner dead after one late answer", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(timeout()).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    expect(await runnerAlive("https://sb-x.vercel.run")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up at once on a refused connection and after three timeouts", async () => {
    const refused = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", refused);
    expect(await runnerAlive("https://sb-x.vercel.run")).toBe(false);
    expect(refused).toHaveBeenCalledTimes(1);

    const slow = vi.fn().mockRejectedValue(timeout());
    vi.stubGlobal("fetch", slow);
    expect(await runnerAlive("https://sb-x.vercel.run")).toBe(false);
    expect(slow).toHaveBeenCalledTimes(3);
  });
});
