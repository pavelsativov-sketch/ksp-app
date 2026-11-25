import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const requireAdmin = vi.fn();
vi.mock("./auth", () => ({
  AdminError: class AdminError extends Error {},
  requireAdmin: () => requireAdmin(),
}));

const { adminMetadata } = await import("./page-guard");

describe("adminMetadata", () => {
  beforeEach(() => {
    requireAdmin.mockReset();
  });

  it("отдаёт заголовок админки только админу", async () => {
    requireAdmin.mockResolvedValue({ id: "a" });
    expect(await adminMetadata("Админ")()).toEqual({ title: "Админ", robots: { index: false, follow: false } });
  });

  it("гостю, не-админу и при сбое БД заголовок не раскрывает", async () => {
    requireAdmin.mockRejectedValue(new Error("401"));
    const meta = await adminMetadata("Админ")();
    expect(meta).not.toHaveProperty("title");
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});
