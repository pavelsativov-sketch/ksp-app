import { describe, expect, it } from "vitest";
import { formatDateAlmaty } from "@/lib/format-date";

describe("formatDateAlmaty", () => {
  it("после 19:00 UTC уже следующий день по Алматы", () => {
    expect(formatDateAlmaty("2026-11-25T20:00:00Z", "ru")).toBe("26.11.2026");
  });
});
