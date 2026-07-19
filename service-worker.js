"use strict";

const CACHE_PREFIX = "twstock-pages";
const CACHE_VERSION = "v18.0-pwa-1";
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const SHELL_PATHS = [
  "./",
  "index.html",
  "web.html",
  "main.html?mode=web",
  "site.webmanifest",
  "assets/icons/app-cover.png",
  "assets/icons/app-icon-192.png",
  "assets/icons/app-icon-512.png",
  "assets/icons/app-icon-maskable-512.png",
  "assets/icons/apple-touch-icon.png",
  "app_files/web_adapter.js",
  "app_files/analysis_frameworks.js",
  "app_files/theme_regime.js",
  "app_files/cache_repository.js",
  "app_files/performance_diagnostics.js",
  "app_files/update_reliability.js",
  "app_files/perf_worker.js",
  "app_files/main.js",
  "app_files/changelog.html",
  "data/state_core.json",
  "data/state.json",
  "data/research_data.json",
  "data/active_twETF_weekly_snapshots.json",
  "data/podcast_digest.json",
  "data/youtube_market_lessons.json"
];

function scopedUrl(path) {
  return new URL(path, self.registration.scope).href;
}

const CACHEABLE_URLS = new Set(SHELL_PATHS.map(scopedUrl));

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
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_PATHS.map(scopedUrl)))
      .then(() => self.skipWaiting())
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
    .then((response) => {
      if (isSafeCacheResponse(response)) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await refresh) || Response.error();
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
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
