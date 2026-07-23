"use strict";

(() => {
  if (typeof window === "undefined") return;
  if (window.chrome && window.chrome.runtime && window.chrome.storage) return;

  const DB_NAME = "twStockWebChromeStorage_v1";
  const STORE_NAME = "kv";
  const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
  const WEB_RUNTIME_AUDIT_LIMIT = 50;
  const WEB_FETCH_HOSTS = new Set([
    "mis.twse.com.tw", "www.twse.com.tw", "www.tpex.org.tw", "mops.twse.com.tw", "mopsfin.twse.com.tw",
    "query1.finance.yahoo.com", "query2.finance.yahoo.com", "tw.stock.yahoo.com",
    "feeds.soundon.fm", "rss.soundon.fm", "files.soundon.fm", "filesb.soundon.fm", "feed.firstory.me", "open.firstory.me",
    "www.tdcc.com.tw", "www.taifex.com.tw", "mis.taifex.com.tw", "openapi.twse.com.tw",
    "www.ezmoney.com.tw", "www.nomurafunds.com.tw", "www.capitalfund.com.tw", "www.cathaysite.com.tw",
    "www.tsit.com.tw", "websys.fsit.com.tw", "am.jpmorgan.com", "www.yuantaetfs.com", "yuantaetfs.com",
    "www.fhtrust.com.tw", "www.fsitc.com.tw", "www.megafunds.com.tw", "www.etfinfo.tw", "www.moneydj.com",
    "www.trendforce.com", "www.wantgoo.com", "www.investing.com", "www.cmoney.tw", "www.pocket.tw",
    "news.cnyes.com", "api.cnyes.com", "cdn.cboe.com", "home.treasury.gov", "www.federalreserve.gov",
    "www.cmegroup.com", "www.cbc.gov.tw", "tide-tw.app"
  ]);

  const webRuntimeAudit = {
    policy: "same-origin-snapshot-only",
    blockedCrossOriginFetches: []
  };
  window.__TWSTOCK_WEB_RUNTIME_AUDIT__ = webRuntimeAudit;

  function recordBlockedCrossOriginFetch(url, method = "GET", caller = "fetch-text") {
    let parsed = null;
    try { parsed = new URL(String(url || ""), window.location.href); } catch (_) {}
    webRuntimeAudit.blockedCrossOriginFetches.push({
      caller,
      method: String(method || "GET").toUpperCase(),
      host: parsed?.hostname || "invalid-url",
      path: parsed?.pathname || "",
      blockedAt: new Date().toISOString()
    });
    if (webRuntimeAudit.blockedCrossOriginFetches.length > WEB_RUNTIME_AUDIT_LIMIT) {
      webRuntimeAudit.blockedCrossOriginFetches.splice(0, webRuntimeAudit.blockedCrossOriginFetches.length - WEB_RUNTIME_AUDIT_LIMIT);
    }
  }
  window.__TWSTOCK_RECORD_WEB_BLOCKED_FETCH__ = recordBlockedCrossOriginFetch;

  // 最終防線：公開 PWA 的任何程式路徑都只能 fetch 同來源資源。
  // 這個 adapter 在真正的 Chrome extension 環境會於檔案開頭直接 return，因此不影響 extension host permissions。
  const nativeFetch = window.fetch.bind(window);
  const webRequestBroker = window.TwStockRequestBroker?.createRequestBroker({ fetchImpl: nativeFetch }) || null;
  window.fetch = function webSnapshotOnlyFetch(input, init = undefined) {
    const requestUrl = input instanceof Request ? input.url : String(input || "");
    const parsed = new URL(requestUrl, window.location.href);
    if (parsed.origin !== window.location.origin) {
      const method = init?.method || (input instanceof Request ? input.method : "GET");
      recordBlockedCrossOriginFetch(parsed.href, method, "global-fetch-guard");
      return Promise.reject(new TypeError(`公開網站只允許同來源快照：${parsed.hostname}`));
    }
    return nativeFetch(input, init);
  };

  function normalizedFetchUrl(value) {
    const parsed = new URL(String(value || ""), window.location.href);
    if (parsed.username || parsed.password) throw new Error("網址不得包含帳號或密碼");
    if (parsed.origin === window.location.origin) return parsed.href;
    if (parsed.protocol !== "https:" || !WEB_FETCH_HOSTS.has(parsed.hostname)) {
      throw new Error(`網頁版不允許連線到此來源：${parsed.hostname || parsed.protocol}`);
    }
    return parsed.href;
  }

  function normalizedNavigationUrl(value) {
    const parsed = new URL(String(value || ""), window.location.href);
    if (parsed.username || parsed.password) throw new Error("網址不得包含帳號或密碼");
    if (parsed.protocol === "https:" || (parsed.protocol === "http:" && parsed.origin === window.location.origin)) return parsed.href;
    throw new Error("只允許安全的 HTTPS 外部連結");
  }

  function normalizedDownloadUrl(value) {
    const parsed = new URL(String(value || ""), window.location.href);
    if (parsed.username || parsed.password) throw new Error("下載網址不得包含帳號或密碼");
    if (parsed.protocol === "https:" || parsed.protocol === "blob:") return parsed.href;
    if (parsed.protocol === "http:" && parsed.origin === window.location.origin) return parsed.href;
    throw new Error("只允許 HTTPS、同來源或瀏覽器 blob 下載");
  }

  async function readLimitedResponseText(response, encoding = "") {
    const announcedBytes = Number(response.headers.get("content-length") || 0);
    if (announcedBytes > MAX_RESPONSE_BYTES) throw new Error("回應內容超過 8 MB 安全上限");
    if (!response.body || typeof response.body.getReader !== "function") {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_RESPONSE_BYTES) throw new Error("回應內容超過 8 MB 安全上限");
      return new TextDecoder(encoding || "utf-8").decode(buffer);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder(encoding || "utf-8");
    let bytes = 0;
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel("response too large");
        throw new Error("回應內容超過 8 MB 安全上限");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      req.onsuccess = (event) => resolve(event.target.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbRemove(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbGetAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const out = {};
      const req = tx.objectStore(STORE_NAME).openCursor();
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          resolve(out);
          return;
        }
        out[cursor.key] = cursor.value;
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }

  function setLastError(runtime, error) {
    runtime.lastError = error ? { message: error.message || String(error) } : null;
    window.setTimeout(() => { runtime.lastError = null; }, 0);
  }

  async function fetchTextMessage(message) {
    const requestUrl = normalizedFetchUrl(message.url);
    const method = String(message.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "POST") throw new Error(`不允許的 HTTP 方法：${method}`);
    if (message.body && String(message.body).length > 262144) throw new Error("請求內容超過 256 KB 安全上限");
    const parsedRequestUrl = new URL(requestUrl);
    if (parsedRequestUrl.origin !== window.location.origin) {
      recordBlockedCrossOriginFetch(requestUrl, method);
      return {
        ok: false,
        error: `公開網站不直接讀取跨站資料：${parsedRequestUrl.hostname}；請使用 GitHub Actions 延遲快照或開啟原始來源連結。`,
        errorCode: "WEB_RUNTIME_BOUNDARY",
        errorCategory: "runtime-boundary",
        retryable: false,
        status: null,
        bytes: 0,
        durationMs: 0,
        attempts: 0,
        finalUrl: requestUrl
      };
    }
    if (!webRequestBroker) {
      return { ok: false, error: "網站 Request Broker 未載入", errorCode: "BROKER_UNAVAILABLE", errorCategory: "runtime", retryable: false };
    }
    const headers = {
      Accept: "text/html,application/rss+xml,application/xml,text/xml,application/json,text/plain,*/*",
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8"
    };
    if (message.body) {
      const requestedType = String(message.contentType || "application/x-www-form-urlencoded").toLowerCase();
      const allowedTypes = new Set(["application/x-www-form-urlencoded", "application/json", "text/plain"]);
      headers["Content-Type"] = allowedTypes.has(requestedType) ? requestedType : "application/x-www-form-urlencoded";
    }
    try {
      const result = await webRequestBroker.requestText({
        url: requestUrl,
        method,
        headers,
        body: message.body || undefined,
        contentType: message.contentType || "",
        encoding: message.encoding || "",
        timeoutMs: message.timeoutMs,
        maxResponseBytes: message.maxResponseBytes || MAX_RESPONSE_BYTES,
        expectedType: message.expectedType,
        sourceKey: message.sourceKey,
        taskKey: message.taskKey,
        retryLimit: message.retryLimit,
        maxRetryDelayMs: message.maxRetryDelayMs,
        concurrency: message.concurrency
      });
      normalizedFetchUrl(result.finalUrl || requestUrl);
      return {
        ok: true,
        text: result.text,
        status: result.status,
        bytes: result.bytes,
        durationMs: result.durationMs,
        attempts: result.attempts,
        attemptHistory: result.attemptHistory,
        contentType: result.contentType,
        expectedType: result.expectedType,
        finalUrl: result.finalUrl,
        redirected: result.redirected,
        sourceKey: result.sourceKey,
        taskKey: result.taskKey,
        fetchedAt: result.fetchedAt
      };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || String(error),
        errorCode: error?.code || "NETWORK_ERROR",
        errorCategory: error?.category || "network",
        retryable: error?.retryable === true,
        status: Number(error?.status) || null,
        bytes: Number(error?.responseBytes) || 0,
        durationMs: Number(error?.durationMs) || 0,
        attempts: Number(error?.attempts) || 1,
        attemptHistory: Array.isArray(error?.attemptHistory) ? error.attemptHistory : [],
        retryAfterMs: Number.isFinite(Number(error?.retryAfterMs)) ? Number(error.retryAfterMs) : null,
        nextRetryAt: error?.nextRetryAt || null,
        contentType: error?.contentType || "",
        responsePreview: error?.responsePreview || "",
        finalUrl: error?.finalUrl || requestUrl
      };
    }
  }

  function downloadFile(url, filename) {
    const safeUrl = normalizedDownloadUrl(url);
    const anchor = document.createElement("a");
    anchor.href = safeUrl;
    anchor.download = String(filename || "download").split("/").pop() || "download";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return { ok: true, downloadId: Date.now() };
  }

  const runtime = {
    lastError: null,
    getURL(path) {
      return String(path || "");
    },
    sendMessage(message, callback) {
      const done = (response, error = null) => {
        setLastError(runtime, error);
        if (typeof callback === "function") callback(response);
      };
      if (!message || !message.type) {
        done(null, new Error("unsupported message"));
        return true;
      }
      if (message.type === "fetch-text" && message.url) {
        fetchTextMessage(message).then((response) => done(response)).catch((error) => done({ ok: false, error: error.message || String(error) }));
        return true;
      }
      if (message.type === "cancel-fetches") {
        const taskKey = String(message.taskKey || "default");
        done({ ok: true, taskKey, cancelled: webRequestBroker?.cancelGroup(taskKey) || 0 });
        return true;
      }
      if (message.type === "download-file" && message.url) {
        try {
          done(downloadFile(message.url, message.filename));
        } catch (error) {
          done({ ok: false, error: error.message || String(error) }, error);
        }
        return true;
      }
      done(null, new Error(`unsupported message type: ${message.type}`));
      return true;
    }
  };

  const storageLocal = {
    get(keys, callback) {
      (async () => {
        if (typeof keys === "string") return { [keys]: await idbGet(keys) };
        if (Array.isArray(keys)) {
          const out = {};
          for (const key of keys) out[key] = await idbGet(key);
          return out;
        }
        if (keys && typeof keys === "object") {
          const out = { ...keys };
          for (const key of Object.keys(keys)) {
            const value = await idbGet(key);
            if (value !== undefined) out[key] = value;
          }
          return out;
        }
        return await idbGetAll();
      })()
        .then((result) => {
          setLastError(runtime, null);
          if (typeof callback === "function") callback(result);
        })
        .catch((error) => {
          setLastError(runtime, error);
          if (typeof callback === "function") callback({});
        });
    },
    set(items, callback) {
      (async () => {
        for (const [key, value] of Object.entries(items || {})) await idbSet(key, value);
      })()
        .then(() => {
          setLastError(runtime, null);
          if (typeof callback === "function") callback();
        })
        .catch((error) => {
          setLastError(runtime, error);
          if (typeof callback === "function") callback();
        });
    },
    remove(keys, callback) {
      (async () => {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const key of list.filter(Boolean)) await idbRemove(key);
      })()
        .then(() => {
          setLastError(runtime, null);
          if (typeof callback === "function") callback();
        })
        .catch((error) => {
          setLastError(runtime, error);
          if (typeof callback === "function") callback();
        });
    }
  };

  window.chrome = {
    runtime,
    storage: { local: storageLocal },
    downloads: {
      download(options, callback) {
        try {
          const result = downloadFile(options.url, options.filename);
          setLastError(runtime, null);
          if (typeof callback === "function") callback(result.downloadId);
        } catch (error) {
          setLastError(runtime, error);
          if (typeof callback === "function") callback(null);
        }
      }
    },
    tabs: {
      create(options) {
        const safeUrl = normalizedNavigationUrl(options?.url);
        window.open(safeUrl, "_blank", "noopener,noreferrer");
        return Promise.resolve({ url: safeUrl });
      }
    }
  };

  document.documentElement.dataset.runtime = "web";

  let deferredInstallPrompt = null;

  function isStandaloneWebApp() {
    return window.matchMedia?.("(display-mode: standalone)").matches === true
      || window.navigator.standalone === true;
  }

  function installWebAppNotice() {
    if (isStandaloneWebApp() || localStorage.getItem("twStockWebInstallNoticeDismissed") === "1") return;
    const userAgent = navigator.userAgent || "";
    const isiOS = /iPad|iPhone|iPod/i.test(userAgent)
      || (/Macintosh/i.test(userAgent) && Number(navigator.maxTouchPoints || 0) > 1);
    if (!isiOS && !deferredInstallPrompt) return;
    if (document.querySelector("[data-web-app-install-notice]")) return;

    const style = document.createElement("style");
    style.textContent = `
      .web-app-install-notice{position:fixed;z-index:10000;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));left:max(14px,env(safe-area-inset-left));margin:auto;max-width:620px;display:flex;gap:12px;align-items:center;padding:13px 14px;border:1px solid rgba(11,109,119,.28);border-radius:16px;background:#ffffff;color:#211a14;box-shadow:0 16px 40px rgba(35,26,17,.2);font:600 .84rem/1.45 -apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif}
      .web-app-install-notice span{flex:1}.web-app-install-notice button{border:1px solid rgba(11,109,119,.3);border-radius:10px;background:#0b6d77;color:#fff;padding:8px 11px;font:inherit;cursor:pointer}.web-app-install-notice .dismiss{background:#fff;color:#6f6356}
      @media(max-width:560px){.web-app-install-notice{align-items:flex-start;flex-wrap:wrap}.web-app-install-notice span{flex-basis:100%}}
    `;
    document.head.appendChild(style);

    const notice = document.createElement("aside");
    notice.className = "web-app-install-notice";
    notice.dataset.webAppInstallNotice = "true";
    notice.setAttribute("role", "status");
    const message = document.createElement("span");
    message.textContent = isiOS
      ? "可加入 iPhone／iPad 主畫面：Safari 分享 → 加入主畫面 → 開啟為 Web App。"
      : "可將台股追蹤安裝成桌面 Web App；個人設定只保存在這個瀏覽器。";
    notice.appendChild(message);

    if (!isiOS && deferredInstallPrompt) {
      const installButton = document.createElement("button");
      installButton.type = "button";
      installButton.textContent = "安裝 App";
      installButton.addEventListener("click", async () => {
        const prompt = deferredInstallPrompt;
        deferredInstallPrompt = null;
        if (prompt) await prompt.prompt();
        notice.remove();
      });
      notice.appendChild(installButton);
    }

    const dismissButton = document.createElement("button");
    dismissButton.type = "button";
    dismissButton.className = "dismiss";
    dismissButton.textContent = "稍後";
    dismissButton.addEventListener("click", () => {
      localStorage.setItem("twStockWebInstallNoticeDismissed", "1");
      notice.remove();
    });
    notice.appendChild(dismissButton);
    document.body.appendChild(notice);
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installWebAppNotice();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    document.querySelector("[data-web-app-install-notice]")?.remove();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installWebAppNotice, { once: true });
  } else {
    installWebAppNotice();
  }

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js", { scope: "./" })
        .then(() => navigator.serviceWorker.ready)
        .then((registration) => {
          const warmOptional = () => registration.active?.postMessage({ type: "WARM_OPTIONAL_CACHE" });
          if (typeof window.requestIdleCallback === "function") {
            window.requestIdleCallback(warmOptional, { timeout: 5000 });
          } else {
            window.setTimeout(warmOptional, 1500);
          }
        })
        .catch((error) => console.warn("PWA service worker registration failed", error));
    }, { once: true });
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type !== "TWSTOCK_OPTIONAL_CACHE_RESULT") return;
      window.__TWSTOCK_PWA_CACHE_STATUS__ = event.data;
      if (event.data.failed) console.warn("PWA optional cache completed with failures", event.data);
    });
  }
})();
