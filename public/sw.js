/* KSP App — ручной service worker
   Кэширует статику и навигацию для офлайн-чтения.
   Черновики планов живут в localStorage (ksp-draft:*) — SW их не трогает,
   но обеспечивает офлайн-оболочку, чтобы редактор открылся без сети. */

const CACHE_NAME = "ksp-app-v1";
const OFFLINE_URL = "/";

const PRECACHE = [
  OFFLINE_URL,
  "/manifest.json",
];

// Статика, которую кэшируем при установке (best-effort)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Навигация: network-first, fallback к кэшу/офлайну.
// Остальные GET: cache-first для статики, network-first для API.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Не кэшируем API/стримы/AI — всегда сеть
  if (url.pathname.startsWith("/api/")) return;

  const isNavigation = req.mode === "navigate" || req.headers.get("accept")?.includes("text/html");

  if (isNavigation) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, res.clone()).catch(() => undefined);
          return res;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          const fallback = await caches.match(OFFLINE_URL);
          if (fallback) return fallback;
          return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })(),
    );
    return;
  }

  // Статика (/_next/static, /_next/image, шрифты, иконки): cache-first
  const isStatic =
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/monaco/") ||
    /\.(?:js|css|svg|png|jpg|jpeg|webp|woff2?)$/i.test(url.pathname);

  if (isStatic) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) {
          // освежаем в фоне
          event.waitUntil(
            fetch(req)
              .then((res) => {
                if (res.ok) caches.open(CACHE_NAME).then((c) => c.put(req, res).catch(() => undefined));
              })
              .catch(() => undefined),
          );
          return cached;
        }
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, res.clone()).catch(() => undefined);
          }
          return res;
        } catch {
          return cached ?? new Response("", { status: 504 });
        }
      })(),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
