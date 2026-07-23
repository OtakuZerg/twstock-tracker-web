"use strict";

const CACHE_PREFIX = "twstock-pages";
const CACHE_VERSION = "v18.0-pwa-3";
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const REQUIRED_SHELL_PATHS = [
  "main.html?mode=web",
  "app_files/request_broker.js",
  "app_files/source_fallbacks.js",
  "app_files/web_adapter.js",
  "app_files/analysis_frameworks.js",
  "app_files/theme_regime.js",
  "app_files/cache_repository.js",
  "app_files/performance_diagnostics.js",
  "app_files/update_reliability.js",
  "app_files/perf_worker.js",
  "app_files/main.js",
  "data/state_core.json"
];
const OPTIONAL_CACHE_PATHS = [
  "./",
  "index.html",
  "web.html",
  "site.webmanifest",
  "assets/icons/app-cover.png",
  "assets/icons/app-icon-192.png",
  "assets/icons/app-icon-512.png",
  "assets/icons/app-icon-maskable-512.png",
  "assets/icons/apple-touch-icon.png",
  "app_files/changelog.html",
  "data/state.json",
  "data/research_data.json",
  "data/active_twETF_weekly_snapshots.json",
  "data/podcast_digest.json",
  "data/youtube_market_lessons.json"
];
const OPTIONAL_CACHE_BATCH_SIZE = 3;

function scopedUrl(path) {
  return new URL(path, self.registration.scope).href;
}

const CACHEABLE_URLS = new Set([...REQUIRED_SHELL_PATHS, ...OPTIONAL_CACHE_PATHS].map(scopedUrl));

function mayCache(request) {
  try {
    return CACHEABLE_URLS.has(new URL(request.url).href);
  } catch (_) {
    return false;
  }
}

function isSafeCacheResponse(response) {
  return Boolean(response && response.ok && response.type === "basic");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 只有可啟動 App 的最小 shell 會阻擋安裝；大型選用資料改由逐檔容錯暖快取。
      for (const path of REQUIRED_SHELL_PATHS) {
        const request = new Request(scopedUrl(path), { cache: "reload", credentials: "same-origin" });
        const response = await fetch(request);
        if (!isSafeCacheResponse(response)) throw new Error(`Required shell cache failed: ${path} (${response.status})`);
        await cache.put(request, response.clone());
      }
      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(`${CACHE_PREFIX}-`) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cacheAllowed = mayCache(request);
  try {
    const response = await fetch(request);
    if (cacheAllowed && isSafeCacheResponse(response)) await cache.put(request, response.clone());
    return response;
  } catch (_) {
    return (cacheAllowed ? await cache.match(request) : null)
      || (await cache.match(scopedUrl("main.html?mode=web")))
      || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then(async (response) => {
      if (isSafeCacheResponse(response)) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await refresh) || Response.error();
}

async function warmOptionalCache() {
  const cache = await caches.open(CACHE_NAME);
  const results = [];
  for (let index = 0; index < OPTIONAL_CACHE_PATHS.length; index += OPTIONAL_CACHE_BATCH_SIZE) {
    const batch = OPTIONAL_CACHE_PATHS.slice(index, index + OPTIONAL_CACHE_BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map(async (path) => {
      const request = new Request(scopedUrl(path), { cache: "reload", credentials: "same-origin" });
      const response = await fetch(request);
      if (!isSafeCacheResponse(response)) throw new Error(`HTTP ${response.status}`);
      await cache.put(request, response.clone());
      return path;
    }));
    settled.forEach((result, offset) => {
      results.push(result.status === "fulfilled"
        ? { path: batch[offset], ok: true }
        : { path: batch[offset], ok: false, error: String(result.reason?.message || result.reason || "cache failed").slice(0, 160) });
    });
  }
  const summary = {
    type: "TWSTOCK_OPTIONAL_CACHE_RESULT",
    cacheVersion: CACHE_VERSION,
    succeeded: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    failures: results.filter((row) => !row.ok)
  };
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => client.postMessage(summary));
  return summary;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
  if (!mayCache(request)) return;
  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING" || event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (event.data?.type === "WARM_OPTIONAL_CACHE") {
    event.waitUntil(warmOptionalCache());
  }
});
