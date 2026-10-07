export const SITE_NAME = "Mekty";
export const SITE_DESCRIPTION = "КСП, рабочие листы и презентации для учителей Казахстана. Подготовка на русском и казахском языках. Начните бесплатно.";

/**
 * Публичный адрес сайта.
 *
 * Фолбэк берётся из PORT: раньше здесь было жёстко «http://localhost:3100»,
 * при этом сервер по умолчанию поднимается на 3000. В собранном приложении
 * расходились `og:url` и фактический адрес — соцсети и мессенджеры получали
 * ссылки на несуществующий порт.
 */
export function getSiteUrl(value = process.env.APP_URL): string {
  if (!value) {
    const port = process.env.PORT;
    return `http://localhost:${port && /^\d+$/.test(port) ? port : "3000"}`;
  }
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("APP_URL must be a public HTTP(S) URL without credentials");
  }
  return url.origin;
}

export const siteUrl = getSiteUrl();
export const isPublicSite = new URL(siteUrl).protocol === "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(siteUrl).hostname);
export const publicRoutes = ["/", "/pricing", "/library"] as const;
