const CACHE_NAME = "ayudave-shell-v2";
const STATIC_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./ayuda-terremoto-venezuela.html",
  "./como-reportar-ayuda-venezuela.html",
  "./directorio-ayuda-venezuela.html",
  "./datos-abiertos-ayudave.html",
  "./sources.json",
  "./openapi.json",
  "./ayudave-public-export.schema.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.allSettled(STATIC_URLS.map((url) => cache.add(url)))),
  );
  self.skipWaiting();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

function shouldBypassCache(url) {
  return url.pathname.endsWith("/api.php") || url.pathname.endsWith("/cron-sync.php");
}

function isAsset(url) {
  return /\.(?:js|css|svg|png|jpg|jpeg|webp|woff2?|webmanifest)$/i.test(url.pathname);
}

async function networkFirst(request, fallbackUrl = "./index.html") {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(new Request(request, { cache: "reload" }));
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match(fallbackUrl));
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || shouldBypassCache(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request, "./"));
});
