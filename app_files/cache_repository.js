"use strict";

(function attachCacheRepository(globalScope) {
  const DB_NAME = "twStock_tracker_cache_repository";
  const DB_VERSION = 1;
  const KV_STORE = "kv";

  let dbPromise = null;

  function hasIndexedDb() {
    return typeof globalScope.indexedDB !== "undefined";
  }

  function openDb() {
    if (!hasIndexedDb()) return Promise.reject(new Error("IndexedDB unavailable"));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = globalScope.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(KV_STORE)) {
          db.createObjectStore(KV_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    });
    return dbPromise;
  }

  function txStore(db, mode) {
    return db.transaction(KV_STORE, mode).objectStore(KV_STORE);
  }

  async function get(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = txStore(db, "readonly").get(String(key || ""));
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = () => reject(request.error || new Error("IndexedDB get failed"));
    });
  }

  async function set(key, value, meta = {}) {
    const db = await openDb();
    const row = {
      key: String(key || ""),
      value,
      meta: meta && typeof meta === "object" ? meta : {},
      updatedAt: new Date().toISOString()
    };
    return new Promise((resolve, reject) => {
      const request = txStore(db, "readwrite").put(row);
      request.onsuccess = () => resolve(row);
      request.onerror = () => reject(request.error || new Error("IndexedDB set failed"));
    });
  }

  async function del(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = txStore(db, "readwrite").delete(String(key || ""));
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error || new Error("IndexedDB delete failed"));
    });
  }

  async function keys(prefix = "") {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const found = [];
      const request = txStore(db, "readonly").openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(found);
          return;
        }
        const key = String(cursor.key || "");
        if (!prefix || key.startsWith(prefix)) found.push(key);
        cursor.continue();
      };
      request.onerror = () => reject(request.error || new Error("IndexedDB cursor failed"));
    });
  }

  globalScope.TwStockCacheRepository = {
    version: "cache-repository-v1",
    available: hasIndexedDb,
    get,
    set,
    del,
    keys
  };
})(typeof self !== "undefined" ? self : window);
