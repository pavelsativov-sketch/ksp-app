export type CsvValue = string | number | null | undefined;

/** Quote every value and neutralize spreadsheet formulas supplied as text. */
export function csvCell(value: CsvValue): string {
  const raw = value == null ? "" : String(value);
  const text = typeof value === "string" && /^[\s\uFEFF]*[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: CsvValue[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

/** Resolve a user-supplied IANA timezone, falling back to Kazakhstan local time. */
export function resolveReportTimeZone(value: string | null | undefined): string {
  const candidate = value?.trim();
  if (!candidate || candidate.length > 100) return "Asia/Almaty";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    return "Asia/Almaty";
  }
}

export function formatReportTimestamp(date: Date, locale: "ru" | "kk", timeZone: string): string {
  return new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : "ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}
