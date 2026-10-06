import { describe, it, expect } from "vitest";
import { isBlockedAddress, isAllowedOrigin } from "@/lib/agents/ssrf";

/**
 * Регрессия по SSRF: `/api/agents/browser-stream` и `/browser-preview`
 * отдавали содержимое внутренних адресов анонимному посетителю.
 * Проверяем именно границы подсетей — прошлый вариант сравнивал строковые
 * префиксы и пропускал 172.16/12, 100.64/10 и ::ffff:7f00:1.
 */
describe("isBlockedAddress", () => {
  const blocked = [
    "0.0.0.0",
    "10.0.0.1",
    "10.255.255.254",
    "100.64.0.1", // CGNAT
    "100.127.255.255",
    "127.0.0.1",
    "127.1.2.3",
    "169.254.169.254", // метаданные облака
    "169.254.0.1",
    "172.16.0.1",
    "172.31.255.255", // верхняя граница 172.16/12
    "192.0.0.1",
    "192.0.2.5",
    "192.168.1.1",
    "198.18.0.1", // benchmarking
    "198.51.100.7",
    "203.0.113.9",
    "224.0.0.1",
    "255.255.255.255",
  ];

  const allowed = [
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "172.15.255.255", // до 172.16/12
    "172.32.0.1", // после 172.31/12
    "100.63.255.255", // до CGNAT
    "100.128.0.1", // после CGNAT
    "198.17.255.255", // до 198.18/15
    "198.20.0.1", // после 198.19/15
    "169.253.255.255", // до link-local
    "169.255.0.1", // после link-local
  ];

  it.each(blocked)("блокирует %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(allowed)("разрешает публичный %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });

  it("блокирует IPv6 loopback и link-local", () => {
    expect(isBlockedAddress("::1")).toBe(true);
    expect(isBlockedAddress("::")).toBe(true);
    expect(isBlockedAddress("fe80::1")).toBe(true);
    expect(isBlockedAddress("fc00::1")).toBe(true);
    expect(isBlockedAddress("fd12:3456::1")).toBe(true);
    expect(isBlockedAddress("ff02::1")).toBe(true);
  });

  it("блокирует IPv4-mapped в шестнадцатеричной форме", () => {
    // ::ffff:7f00:1 == 127.0.0.1 — обход через hex-запись
    expect(isBlockedAddress("::ffff:7f00:1")).toBe(true);
    // ::ffff:a9fe:a9fe == 169.254.169.254
    expect(isBlockedAddress("::ffff:a9fe:a9fe")).toBe(true);
  });

  it("разрешает публичный IPv6", () => {
    expect(isBlockedAddress("2606:4700:4700::1111")).toBe(false);
    expect(isBlockedAddress("2a00:1450:4001:81f::200e")).toBe(false);
  });

  it("трактует мусор как небезопасный", () => {
    expect(isBlockedAddress("")).toBe(true);
    expect(isBlockedAddress("не-ip")).toBe(true);
    expect(isBlockedAddress("999.1.1.1")).toBe(true);
  });
});

describe("isAllowedOrigin", () => {
  it("пропускает публичные http(s)", () => {
    expect(isAllowedOrigin("https://example.com/a.png")).toBe(true);
    expect(isAllowedOrigin("http://example.com")).toBe(true);
  });

  it("режет внутренние хосты и нестандартные схемы", () => {
    expect(isAllowedOrigin("http://localhost:3000/x")).toBe(false);
    expect(isAllowedOrigin("http://127.0.0.1/x")).toBe(false);
    expect(isAllowedOrigin("http://10.0.0.5/x")).toBe(false);
    expect(isAllowedOrigin("http://192.168.1.1/x")).toBe(false);
    expect(isAllowedOrigin("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedOrigin("http://mongo.internal:27017")).toBe(false);
    expect(isAllowedOrigin("http://db.local/")).toBe(false);
    expect(isAllowedOrigin("file:///etc/passwd")).toBe(false);
    expect(isAllowedOrigin("javascript:alert(1)")).toBe(false);
  });
});