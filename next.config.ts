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
      // Monaco больше не приходит с CDN: редактор раздаётся из public/monaco/vs
      // (собирает scripts/copy-monaco.mjs), поэтому для стилей и шрифтов
      // хватает 'self'. Прежний список разрешал jsdelivr/unpkg — это больше не
      // нужно, и внешний источник кода в редакторе убран.
      "style-src 'self' 'unsafe-inline'",
      // Редактор кода грузит Monaco со своего CDN (@monaco-editor/react
      // default loader); без этого вкладка «Редактор» висит в «Загрузка…».
      `script-src ${scriptSrc} https://cdn.jsdelivr.net https://unpkg.com`,
      // Monaco loader и worker'ы ходят на CDN: разрешаем fetch к нему.
      "connect-src 'self' https://api.openai.com https://generativelanguage.googleapis.com https://openrouter.ai https://api.cloudflare.com wss: https://cdn.jsdelivr.net https://unpkg.com",
      // workerSrc у Monaco это blob:-чанок — разрешаем создание воркеров из blob.
      "worker-src 'self' blob:",
      // Шрифты Monaco (codicon) теперь приходят с нашего домена (public/monaco/vs).
      "font-src 'self' data:",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "playwright",
    "playwright-core",
    // Трассировка Respan (src/instrumentation.ts) патчит классы SDK openai в
    // рантайме. Если Next вкомпилирует свою копию openai в чанк, инстанс в
    // роутах окажется другим объектом и трейсы не появятся. Выносим оба пакета
    // в нативный require, чтобы у серверного кода и инструментатора был один
    // и тот же модуль.
    "openai",
    "@respan/respan",
  ],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
