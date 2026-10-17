import type { NextConfig } from "next";

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
  // connect-src
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      // Monaco со CDN приходит одним листом стилей, а внутри него — свои
      // шрифты (codicon) относительными ссылками, то есть с того же CDN.
      // Без jsdelivr в style-src редактор оставался без стилей: ни нумерации
      // строк, ни миникарты, вёрстка едет и ввод текста искажается.
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com",
      // Редактор кода грузит Monaco со своего CDN (@monaco-editor/react
      // default loader); без этого вкладка «Редактор» висит в «Загрузка…».
      `script-src ${scriptSrc} https://cdn.jsdelivr.net https://unpkg.com`,
      // Monaco loader и worker'ы ходят на CDN: разрешаем fetch к нему.
      "connect-src 'self' https://api.openai.com https://generativelanguage.googleapis.com https://openrouter.ai https://api.cloudflare.com wss: https://cdn.jsdelivr.net https://unpkg.com",
      // workerSrc у Monaco это blob:-чанок — разрешаем создание воркеров из blob.
      "worker-src 'self' blob:",
      // Шрифты Monaco (codicon) приходят с того же CDN, что и его стили.
      "font-src 'self' data: https://cdn.jsdelivr.net https://unpkg.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "playwright",
    "playwright-core",
  ],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
