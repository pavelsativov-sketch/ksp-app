import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const isDev = process.env.NODE_ENV !== "production";

// В dev React использует eval() для восстановления стека и hot-reload, а
// Strict Mode / Turbopack добавляют inline-скрипты. Без 'unsafe-eval' в
// development-консоли каждой страницы сыпалась ошибка:
//   "eval() is not supported in this environment..." React requires eval() in dev
// В production эти директивы не нужны и опасны, поэтому добавляем их только в dev.
const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";

// frame-ancestors 'none' / X-Frame-Options: DENY запрещали встраивать даже
// собственные страницы: /school показывает /plans/new и /school/dashboard
// внутри iframe-приложений, и браузер блокировал их пустым окном.
// SAMEORIGIN достаточно: кликабельность стороннего iframe не нужна.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS: браузер запоминает, что на этот домен ходят только по HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // connect-src ограничен конкретными доменами: с 'https:' данные можно было бы
  // увести на любой внешний хост.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline'",
      `script-src ${scriptSrc}`,
      "connect-src 'self' https://api.openai.com https://generativelanguage.googleapis.com https://openrouter.ai https://api.cloudflare.com wss:",
      "font-src 'self' data:",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

if (process.env.NODE_ENV !== "production") initOpenNextCloudflareForDev();

export default nextConfig;
