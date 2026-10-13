import net from "net";
import { lookup, resolve4, resolve6 } from "node:dns/promises";

/**
 * Защита браузерного агента от SSRF.
 *
 * Раньше `/api/agents/browser-stream` принимал любой URL от анонимного
 * посетителя и открывал его в общем Playwright-браузере процесса. Через это
 * можно было дёрнуть метаданные облака (`169.254.169.254`), Mongo на
 * `localhost:27017` и любой внутренний сервис, а заодно управлять сессией
 * чужого пользователя через общий `global.__playwrightPage`.
 *
 * Правила проверки:
 *  - только http/https;
 *  - хост резолвится, и КАЖДЫЙ его адрес должен быть публичным;
 *  - внутри браузера каждый подзапрос проверяется заново (иначе страница
 *    уводит Playwright во внутреннюю сеть в обход проверки выше).
 */

/**
 * IPv4-подсети, из которых нельзя ходить наружу из песочницы.
 * Префикс задан числом октетов: 8 → /8, 16 → /12 и т.п.
 */
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], // «this network»
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, включая 169.254.169.254
  ["172.16.0.0", 12],
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16],
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function toV4Number(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function matchesCidr(ip: number, cidr: string, prefix: number): boolean {
  const base = toV4Number(cidr);
  if (base === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return ((ip & mask) >>> 0) === ((base & mask) >>> 0);
}

/**
 * Публичный ли адрес.
 *
 * Неизвестная форма (например, IPv4-mapped в hex-записи `::ffff:7f00:1`)
 * считается небезопасной — по принципу «на всякий случай».
 */
export function isBlockedAddress(addr: string): boolean {
  const type = net.isIP(addr);

  if (type === 4) {
    const ip = toV4Number(addr);
    if (ip === null) return true;
    return BLOCKED_V4.some(([cidr, prefix]) => matchesCidr(ip, cidr, prefix));
  }

  if (type === 6) {
    const low = addr.toLowerCase().split("%")[0]!;

    if (low === "::" || low === "::1") return true;
    if (/^fe[89ab]/.test(low)) return true; // fe80::/10 link-local
    if (/^f[cd]/.test(low)) return true; // fc00::/7 unique-local
    if (low.startsWith("ff")) return true; // ff00::/8 multicast

    // IPv4-mapped/compatible в шестнадцатеричной форме не разбираем:
    // ::ffff:7f00:1 — это 127.0.0.1, и такой обход не должен проходить.
    if (/::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(low)) return true;

    const dotted = low.match(/^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (dotted) return isBlockedAddress(dotted[1]!);

    // Teredo (2001::/32) и 6to4 (2002::/16) умеют инкапсулировать IPv4 —
    // запрещаем целиком.
    if (low.startsWith("2001:0:") || low.startsWith("2002:")) return true;

    return false;
  }

  // Не IP-адрес (пустая строка, мусор) — считаем небезопасным.
  return true;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; error: string; status: number };

/** Резолвит хост и проверяет, что все его адреса публичные. */
export async function checkPublicUrl(raw: string): Promise<UrlCheck> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Некорректный URL", status: 400 };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Разрешены только http и https", status: 400 };
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) return { ok: false, error: "Некорректный URL", status: 400 };

  if (net.isIP(host)) {
    if (isBlockedAddress(host)) return { ok: false, error: "Запрос во внутреннюю сеть запрещён", status: 403 };
    return { ok: true, url };
  }

  if (!/^[a-z0-9.-]+$/.test(host) || isLocalHostname(host)) {
    return { ok: false, error: "Запрос во внутреннюю сеть запрещён", status: 403 };
  }

  let addresses: string[] = [];
  try {
    const lookedUp = await lookup(host, { all: true });
    addresses = lookedUp.map((r) => r.address);
  } catch {
    const resolved = await Promise.allSettled([resolve4(host), resolve6(host)]);
    addresses = resolved.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
  }

  if (addresses.length === 0) {
    return { ok: false, error: "Не удалось разрешить хост", status: 400 };
  }

  if (addresses.some((address) => isBlockedAddress(address))) {
    return { ok: false, error: "Запрос во внутреннюю сеть запрещён", status: 403 };
  }

  return { ok: true, url };
}

/** Имена хостов, которые всегда означают локальную машину. */
function isLocalHostname(host: string): boolean {
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  );
}

/** Разрешён ли origin (используется для перехвата подзапросов в браузере). */
export function isAllowedOrigin(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIP(host)) return !isBlockedAddress(host);
  return /^[a-z0-9.-]+$/.test(host) && !isLocalHostname(host);
}

/** Структурный тип поверхности Playwright — без импорта пакета в общий модуль. */
interface Routeable {
  unroute?(url: string | RegExp | ((url: URL) => boolean)): Promise<void>;
  route(
    url: string | RegExp | ((url: URL) => boolean),
    handler: (route: RouteLike) => unknown,
  ): unknown;
}

interface RouteLike {
  request: () => { url: () => string };
  continue: () => Promise<void>;
  abort: () => Promise<void>;
}

/**
 * Ставит перехватчик, который запрещает ВСЕ подзапросы, кроме явно
 * проверенного origin. Это закрывает и DNS-rebinding, и уход страницы
 * во внутреннюю сеть через <img>/fetch/XHR.
 */
export async function installRequestGuard(page: Routeable): Promise<void> {
  // One active policy per page; old handlers must not block a later navigation.
  await page.unroute?.("**/*").catch(() => {});
  await page.route("**/*", async (route) => {
    const target = route.request().url();
    // Allow public SSO/CDN origins after resolving and checking every address.
    // This keeps authentication flows working without granting private-network access.
    // Re-resolve every request, including the original origin, to block DNS rebinding.
    const checked = await checkPublicUrl(target);
    if (checked.ok) return route.continue();
    return route.abort();
  });
}

function getDnsErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}
