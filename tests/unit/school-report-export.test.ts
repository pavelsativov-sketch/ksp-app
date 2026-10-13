import { describe, expect, it } from "vitest";
import {
  csvCell,
  formatReportTimestamp,
  resolveReportTimeZone,
  toCsv,
} from "@/lib/school-report-export";

describe("school report export helpers", () => {
  it.each(["=1+1", "+SUM(A1:A2)", "-1+2", "@SUM(A1:A2)", " \t=1+1"])(
    "neutralizes spreadsheet formulas beginning with %s",
    (value) => {
      expect(csvCell(value)).toBe(`"'${value.replace(/"/g, '""')}"`);
    },
  );

  it("quotes commas, quotes, and newlines in text cells", () => {
    expect(csvCell('A,"B"\nC')).toBe('"A,""B""\nC"');
  });

  it("keeps trusted numeric values numeric while protecting text", () => {
    expect(csvCell(-12)).toBe('"-12"');
    expect(csvCell("-12")).toBe('"\'-12"');
  });

  it("adds a UTF-8 BOM and CRLF row separators", () => {
    expect(toCsv([["A", "B"], [1, 2]])).toBe('\uFEFF"A","B"\r\n"1","2"');
  });

  it("accepts valid IANA time zones and falls back for invalid or oversized values", () => {
    expect(resolveReportTimeZone("UTC")).toBe("UTC");
    expect(resolveReportTimeZone("Not/AZone")).toBe("Asia/Almaty");
    expect(resolveReportTimeZone("x".repeat(101))).toBe("Asia/Almaty");
    expect(resolveReportTimeZone(null)).toBe("Asia/Almaty");
  });

  it("formats timestamps with the requested locale and time zone", () => {
    const value = new Date("2026-10-13T00:00:00.000Z");
    expect(formatReportTimestamp(value, "ru", "Asia/Almaty")).toBeTruthy();
    expect(formatReportTimestamp(value, "kk", "Asia/Almaty")).toBeTruthy();
  });
});
