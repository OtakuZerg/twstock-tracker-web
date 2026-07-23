"use strict";

(function attachRequestBroker(root) {
  const VERSION = "request-broker-v1";
  const DEFAULT_TIMEOUT_MS = 12000;
  const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
  const DEFAULT_RETRY_LIMIT = 1;
  const DEFAULT_MAX_RETRY_DELAY_MS = 15000;
  const DEFAULT_CONCURRENCY = 3;
  const MAX_TRACE_ROWS = 80;
  const JSON_PREFIX_RE = /^\s*[\[{]/;
  const HTML_PREFIX_RE = /^\s*(?:<!doctype\s+html|<html|<head|<body)/i;
  const CSV_HINT_RE = /(?:,|\t).*(?:\r?\n|$)/;
  const CHALLENGE_PATTERNS = [
    /for security reasons/i,
    /access denied/i,
    /verify (?:that )?you are human/i,
    /checking your browser/i,
    /captcha/i,
    /cloudflare ray id/i,
    /cdn-cgi\/challenge-platform/i,
    /__CF\$cv/i,
    /cf-chl-/i,
    /window\.location\.replace\([^)]*REINIT/i,
    /request blocked/i,
    /機器人驗證/,
    /存取遭拒/,
    /安全性原因/
  ];

  function finiteNumber(value, fallback = null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max, fallback) {
    const parsed = finiteNumber(value, fallback);
    return Math.max(min, Math.min(max, parsed));
  }

  function isoTime(nowMs) {
    return new Date(nowMs).toISOString();
  }

  function cleanText(value, limit = 400) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function sourceKeyForUrl(rawUrl) {
    try {
      return new URL(String(rawUrl || ""), "https://local.invalid/").hostname.toLowerCase().replace(/^www\./, "") || "local";
    } catch (_) {
      return "invalid-url";
    }
  }

  function inferExpectedType(rawUrl, explicitType = "") {
    const explicit = String(explicitType || "").toLowerCase();
    if (["json", "csv", "html", "text", "auto"].includes(explicit)) return explicit;
    try {
      const parsed = new URL(String(rawUrl || ""), "https://local.invalid/");
      const path = parsed.pathname.toLowerCase();
      const response = String(parsed.searchParams.get("response") || "").toLowerCase();
      if (
        path.endsWith(".json")
        || response === "json"
        || parsed.hostname.startsWith("openapi.")
        || /\/(?:api|v\d+)\//.test(path)
        || /\/finance\/chart\//.test(path)
      ) return "json";
      if (path.endsWith(".csv")) return "csv";
      if (path.endsWith(".html") || path.endsWith(".htm")) return "html";
    } catch (_) {}
    return "auto";
  }

  function parseRetryAfter(value, nowMs = Date.now()) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    if (/^\d+(?:\.\d+)?$/.test(raw)) return Math.max(0, Math.round(Number(raw) * 1000));
    const timestamp = Date.parse(raw);
    return Number.isFinite(timestamp) ? Math.max(0, timestamp - nowMs) : null;
  }

  function detectChallenge(text) {
    const sample = String(text || "").slice(0, 32768);
    return CHALLENGE_PATTERNS.find((pattern) => pattern.test(sample))?.source || "";
  }

  function validateResponseText(text, meta = {}) {
    const body = String(text || "");
    const expectedType = inferExpectedType(meta.url, meta.expectedType);
    const contentType = String(meta.contentType || "").toLowerCase();
    const challenge = detectChallenge(body);
    if (challenge) {
      return {
        ok: false,
        category: "waf-challenge",
        code: "SOURCE_WAF_CHALLENGE",
        retryable: false,
        message: `來源回傳 WAF／驗證頁，不是可用資料（${challenge}）`
      };
    }
    if (expectedType === "json") {
      if (HTML_PREFIX_RE.test(body) || contentType.includes("text/html")) {
        return {
          ok: false,
          category: "schema",
          code: "SOURCE_CONTENT_TYPE",
          retryable: false,
          message: `來源格式不相容：預期 JSON，實際為 HTML（${contentType || "unknown content-type"}）`
        };
      }
      if (!JSON_PREFIX_RE.test(body)) {
        return {
          ok: false,
          category: "schema",
          code: "SOURCE_SCHEMA_MISMATCH",
          retryable: false,
          message: "來源格式不相容：JSON 回應缺少物件或陣列開頭"
        };
      }
      try {
        JSON.parse(body);
      } catch (error) {
        return {
          ok: false,
          category: "schema",
          code: "SOURCE_JSON_PARSE",
          retryable: false,
          message: `來源 JSON 解析失敗：${cleanText(error?.message || error)}`
        };
      }
    }
    if (expectedType === "csv") {
      if (HTML_PREFIX_RE.test(body) || contentType.includes("text/html")) {
        return {
          ok: false,
          category: "schema",
          code: "SOURCE_CONTENT_TYPE",
          retryable: false,
          message: `來源格式不相容：預期 CSV，實際為 HTML（${contentType || "unknown content-type"}）`
        };
      }
      if (body && !CSV_HINT_RE.test(body)) {
        return {
          ok: false,
          category: "schema",
          code: "SOURCE_SCHEMA_MISMATCH",
          retryable: false,
          message: "來源格式不相容：CSV 回應缺少分隔欄位"
        };
      }
    }
    if (expectedType === "html" && body && !HTML_PREFIX_RE.test(body) && !contentType.includes("text/html")) {
      return {
        ok: false,
        category: "schema",
        code: "SOURCE_CONTENT_TYPE",
        retryable: false,
        message: `來源格式不相容：預期 HTML（${contentType || "unknown content-type"}）`
      };
    }
    return { ok: true, expectedType };
  }

  function classifyFailure(error, meta = {}) {
    const status = finiteNumber(meta.status ?? error?.status, null);
    const code = String(error?.code || meta.code || "");
    const name = String(error?.name || "");
    const message = cleanText(error?.message || error || "unknown error");
    const lower = `${code} ${name} ${message}`.toLowerCase();
    if (code === "REQUEST_CANCELLED" || lower.includes("cancelled") || lower.includes("已取消")) {
      return { category: "cancelled", label: "使用者取消", retryable: false, status, code: code || "REQUEST_CANCELLED" };
    }
    if (code === "REQUEST_TIMEOUT" || name === "TimeoutError" || lower.includes("timeout") || lower.includes("逾時")) {
      return { category: "timeout", label: "來源逾時", retryable: true, status, code: code || "REQUEST_TIMEOUT" };
    }
    if (code === "RESPONSE_TOO_LARGE") {
      return { category: "response-too-large", label: "回應過大", retryable: false, status, code };
    }
    if (code.startsWith("SOURCE_") || lower.includes("schema") || lower.includes("格式不相容") || lower.includes("解析失敗")) {
      const waf = code === "SOURCE_WAF_CHALLENGE" || lower.includes("waf") || lower.includes("challenge");
      return { category: waf ? "waf-challenge" : "schema", label: waf ? "來源阻擋／驗證頁" : "來源格式改版／解析失敗", retryable: false, status, code: code || "SOURCE_SCHEMA" };
    }
    if (status === 429) return { category: "rate-limit", label: "來源限流", retryable: true, status, code: "HTTP_429" };
    if (status === 408) return { category: "timeout", label: "HTTP 408", retryable: true, status, code: "HTTP_408" };
    if (status !== null && status >= 500) return { category: "server", label: `HTTP ${status}`, retryable: true, status, code: `HTTP_${status}` };
    if (status !== null && status >= 300 && status < 400) return { category: "redirect", label: `HTTP ${status} redirect`, retryable: false, status, code: `HTTP_${status}` };
    if (status === 403 || lower.includes("access denied") || lower.includes("forbidden")) {
      return { category: "waf-blocked", label: "來源阻擋／HTTP 403", retryable: false, status, code: "HTTP_403" };
    }
    if (status !== null && status >= 400) return { category: "http", label: `HTTP ${status}`, retryable: false, status, code: `HTTP_${status}` };
    if (lower.includes("enotfound") || lower.includes("name_not_resolved") || lower.includes("dns")) {
      return { category: "dns", label: "DNS 解析失敗", retryable: true, status, code: code || "NETWORK_DNS" };
    }
    if (lower.includes("certificate") || lower.includes("ssl") || lower.includes("tls")) {
      return { category: "tls", label: "TLS／憑證失敗", retryable: true, status, code: code || "NETWORK_TLS" };
    }
    return { category: "network", label: "網路／背景服務失敗", retryable: true, status, code: code || "NETWORK_ERROR" };
  }

  class BrokerError extends Error {
    constructor(message, detail = {}) {
      super(message);
      this.name = "BrokerError";
      Object.assign(this, detail);
    }
  }

  function concurrencyForSource(sourceKey) {
    const key = String(sourceKey || "").toLowerCase();
    if (key.includes("yahoo")) return 4;
    if (key.includes("twse") || key.includes("tpex") || key.includes("mops") || key.includes("taifex")) return 3;
    return DEFAULT_CONCURRENCY;
  }

  function requestIdentity(options, sourceKey) {
    const body = String(options.body || "");
    const group = String(options.taskKey || "default");
    return [group, String(options.method || "GET").toUpperCase(), sourceKey, String(options.url || ""), body].join("|");
  }

  function abortError() {
    return new BrokerError("請求已取消", { code: "REQUEST_CANCELLED", category: "cancelled", retryable: false });
  }

  function timeoutError(timeoutMs) {
    return new BrokerError(`來源逾時（${timeoutMs}ms）`, { code: "REQUEST_TIMEOUT", category: "timeout", retryable: true });
  }

  function abortableDelay(ms, signal, sleepImpl) {
    if (!ms) return Promise.resolve();
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener?.("abort", onAbort);
        callback();
      };
      const onAbort = () => finish(() => reject(abortError()));
      signal?.addEventListener?.("abort", onAbort, { once: true });
      Promise.resolve(sleepImpl(ms)).then(
        () => finish(resolve),
        (error) => finish(() => reject(error))
      );
    });
  }

  async function readLimitedText(response, maxBytes, encoding) {
    const announced = finiteNumber(response.headers?.get?.("content-length"), 0) || 0;
    if (announced > maxBytes) {
      throw new BrokerError(`回應超過 ${maxBytes} bytes 安全上限`, {
        code: "RESPONSE_TOO_LARGE",
        category: "response-too-large",
        retryable: false,
        status: response.status
      });
    }
    if (!response.body?.getReader) {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > maxBytes) {
        throw new BrokerError(`回應超過 ${maxBytes} bytes 安全上限`, {
          code: "RESPONSE_TOO_LARGE",
          category: "response-too-large",
          retryable: false,
          status: response.status
        });
      }
      return { text: new TextDecoder(encoding || "utf-8").decode(buffer), bytes: buffer.byteLength };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder(encoding || "utf-8");
    let bytes = 0;
    let text = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        try { await reader.cancel("response too large"); } catch (_) {}
        throw new BrokerError(`回應超過 ${maxBytes} bytes 安全上限`, {
          code: "RESPONSE_TOO_LARGE",
          category: "response-too-large",
          retryable: false,
          status: response.status
        });
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return { text, bytes };
  }

  function createRequestBroker(config = {}) {
    const fetchImpl = config.fetchImpl || root.fetch?.bind(root);
    if (typeof fetchImpl !== "function") throw new Error("Request broker requires fetch");
    const now = typeof config.now === "function" ? config.now : () => Date.now();
    const random = typeof config.random === "function" ? config.random : Math.random;
    const sleepImpl = typeof config.sleep === "function" ? config.sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const inFlight = new Map();
    const activeBySource = new Map();
    const queueBySource = new Map();
    const controllersByGroup = new Map();
    const trace = [];

    function appendTrace(row) {
      trace.push(row);
      if (trace.length > MAX_TRACE_ROWS) trace.splice(0, trace.length - MAX_TRACE_ROWS);
    }

    function registerController(group, controller) {
      const key = String(group || "default");
      const set = controllersByGroup.get(key) || new Set();
      set.add(controller);
      controllersByGroup.set(key, set);
      return () => {
        set.delete(controller);
        if (!set.size) controllersByGroup.delete(key);
      };
    }

    function acquire(sourceKey, limit, signal) {
      if (signal?.aborted) return Promise.reject(abortError());
      const active = activeBySource.get(sourceKey) || 0;
      if (active < limit) {
        activeBySource.set(sourceKey, active + 1);
        return Promise.resolve(() => release(sourceKey));
      }
      return new Promise((resolve, reject) => {
        const queue = queueBySource.get(sourceKey) || [];
        const row = { resolve, reject, signal, onAbort: null };
        row.onAbort = () => {
          const pending = queueBySource.get(sourceKey) || [];
          const index = pending.indexOf(row);
          if (index >= 0) pending.splice(index, 1);
          reject(abortError());
        };
        signal?.addEventListener?.("abort", row.onAbort, { once: true });
        queue.push(row);
        queueBySource.set(sourceKey, queue);
      });
    }

    function release(sourceKey) {
      const active = Math.max(0, (activeBySource.get(sourceKey) || 1) - 1);
      const queue = queueBySource.get(sourceKey) || [];
      let next = queue.shift();
      while (next?.signal?.aborted) {
        next.signal?.removeEventListener?.("abort", next.onAbort);
        next.reject(abortError());
        next = queue.shift();
      }
      if (next) {
        next.signal?.removeEventListener?.("abort", next.onAbort);
        activeBySource.set(sourceKey, active + 1);
        next.resolve(() => release(sourceKey));
      } else {
        if (active) activeBySource.set(sourceKey, active);
        else activeBySource.delete(sourceKey);
        queueBySource.delete(sourceKey);
      }
    }

    async function fetchAttempt(options, context) {
      const controller = new AbortController();
      const onGroupAbort = () => controller.abort(abortError());
      context.groupSignal.addEventListener("abort", onGroupAbort, { once: true });
      const timeout = setTimeout(() => controller.abort(timeoutError(context.timeoutMs)), context.timeoutMs);
      let releaseSlot = null;
      try {
        releaseSlot = await acquire(context.sourceKey, context.concurrency, context.groupSignal);
        const headers = { ...(options.headers || {}) };
        if (options.body && !headers["Content-Type"]) headers["Content-Type"] = options.contentType || "application/x-www-form-urlencoded";
        const response = await fetchImpl(options.url, {
          method: context.method,
          cache: "no-store",
          credentials: "omit",
          redirect: options.redirect || "follow",
          signal: controller.signal,
          headers,
          body: options.body || undefined
        });
        const retryAfterMs = parseRetryAfter(response.headers?.get?.("retry-after"), now());
        const body = await readLimitedText(response, context.maxResponseBytes, options.encoding);
        const contentType = response.headers?.get?.("content-type") || "";
        if (!response.ok) {
          throw new BrokerError(`HTTP ${response.status}: ${context.sourceKey}`, {
            code: `HTTP_${response.status}`,
            status: response.status,
            retryAfterMs,
            responseBytes: body.bytes,
            contentType,
            finalUrl: response.url || options.url,
            responsePreview: cleanText(body.text, 240)
          });
        }
        const validation = validateResponseText(body.text, {
          url: options.url,
          expectedType: context.expectedType,
          contentType
        });
        if (!validation.ok) {
          throw new BrokerError(validation.message, {
            code: validation.code,
            category: validation.category,
            retryable: validation.retryable,
            status: response.status,
            responseBytes: body.bytes,
            contentType,
            finalUrl: response.url || options.url,
            responsePreview: cleanText(body.text, 240)
          });
        }
        return {
          text: body.text,
          status: response.status,
          bytes: body.bytes,
          contentType,
          expectedType: validation.expectedType,
          finalUrl: response.url || options.url,
          redirected: response.redirected === true || Boolean(response.url && response.url !== options.url),
          retryAfterMs
        };
      } catch (error) {
        if (controller.signal.aborted) {
          const reason = controller.signal.reason;
          if (reason instanceof Error) throw reason;
          throw context.groupSignal.aborted ? abortError() : timeoutError(context.timeoutMs);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
        context.groupSignal.removeEventListener("abort", onGroupAbort);
        releaseSlot?.();
      }
    }

    async function run(options) {
      const startedAt = now();
      const sourceKey = String(options.sourceKey || sourceKeyForUrl(options.url));
      const taskKey = String(options.taskKey || "default");
      const method = String(options.method || "GET").toUpperCase();
      const timeoutMs = clamp(options.timeoutMs, 1000, 60000, DEFAULT_TIMEOUT_MS);
      const maxResponseBytes = clamp(options.maxResponseBytes, 1024, 32 * 1024 * 1024, DEFAULT_MAX_RESPONSE_BYTES);
      const retryLimit = clamp(options.retryLimit, 0, 3, method === "GET" ? DEFAULT_RETRY_LIMIT : 0);
      const maxRetryDelayMs = clamp(options.maxRetryDelayMs, 0, 60000, DEFAULT_MAX_RETRY_DELAY_MS);
      const concurrency = clamp(options.concurrency, 1, 12, concurrencyForSource(sourceKey));
      const expectedType = inferExpectedType(options.url, options.expectedType);
      const groupController = new AbortController();
      const unregister = registerController(taskKey, groupController);
      const attempts = [];
      const context = { sourceKey, taskKey, method, timeoutMs, maxResponseBytes, concurrency, expectedType, groupSignal: groupController.signal };
      try {
        for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
          const attemptStartedAt = now();
          try {
            const value = await fetchAttempt(options, context);
            const attemptRow = { attempt: attempt + 1, ok: true, status: value.status, durationMs: now() - attemptStartedAt, bytes: value.bytes };
            attempts.push(attemptRow);
            const result = {
              ok: true,
              ...value,
              sourceKey,
              taskKey,
              attempts: attempt + 1,
              attemptHistory: attempts,
              durationMs: now() - startedAt,
              fetchedAt: isoTime(now())
            };
            appendTrace({ at: result.fetchedAt, url: options.url, sourceKey, taskKey, ok: true, status: result.status, attempts: result.attempts, durationMs: result.durationMs, bytes: result.bytes });
            return result;
          } catch (error) {
            const classified = classifyFailure(error);
            const retryAfterMs = finiteNumber(error?.retryAfterMs, null);
            attempts.push({
              attempt: attempt + 1,
              ok: false,
              status: classified.status,
              category: classified.category,
              code: classified.code,
              retryable: classified.retryable,
              durationMs: now() - attemptStartedAt,
              error: cleanText(error?.message || error)
            });
            const mayRetry = classified.retryable && attempt < retryLimit;
            if (!mayRetry) {
              error.category = classified.category;
              error.code = error.code || classified.code;
              error.retryable = classified.retryable;
              error.attempts = attempt + 1;
              error.attemptHistory = attempts;
              error.sourceKey = sourceKey;
              error.taskKey = taskKey;
              error.durationMs = now() - startedAt;
              if (retryAfterMs !== null) {
                error.retryAfterMs = retryAfterMs;
                error.nextRetryAt = isoTime(now() + retryAfterMs);
              }
              appendTrace({ at: isoTime(now()), url: options.url, sourceKey, taskKey, ok: false, status: classified.status, category: classified.category, code: error.code, attempts: error.attempts, durationMs: error.durationMs, error: cleanText(error.message) });
              throw error;
            }
            const exponential = Math.min(maxRetryDelayMs, 300 * (2 ** attempt));
            const jitter = Math.round(exponential * 0.25 * random());
            const retryDelayMs = retryAfterMs !== null ? retryAfterMs : exponential + jitter;
            if (retryDelayMs > maxRetryDelayMs) {
              error.category = classified.category;
              error.code = error.code || classified.code;
              error.retryable = true;
              error.attempts = attempt + 1;
              error.attemptHistory = attempts;
              error.sourceKey = sourceKey;
              error.taskKey = taskKey;
              error.durationMs = now() - startedAt;
              error.retryAfterMs = retryDelayMs;
              error.nextRetryAt = isoTime(now() + retryDelayMs);
              appendTrace({ at: isoTime(now()), url: options.url, sourceKey, taskKey, ok: false, status: classified.status, category: classified.category, code: error.code, attempts: error.attempts, durationMs: error.durationMs, error: cleanText(error.message) });
              throw error;
            }
            await abortableDelay(retryDelayMs, groupController.signal, sleepImpl);
          }
        }
        throw new Error("request broker exhausted unexpectedly");
      } finally {
        unregister();
      }
    }

    function requestText(options = {}) {
      if (!options.url) return Promise.reject(new BrokerError("缺少請求 URL", { code: "INVALID_URL", retryable: false }));
      const sourceKey = String(options.sourceKey || sourceKeyForUrl(options.url));
      const identity = requestIdentity(options, sourceKey);
      if (inFlight.has(identity)) return inFlight.get(identity);
      const promise = run({ ...options, sourceKey }).finally(() => inFlight.delete(identity));
      inFlight.set(identity, promise);
      return promise;
    }

    function cancelGroup(taskKey = "default") {
      const key = String(taskKey || "default");
      const controllers = controllersByGroup.get(key) || new Set();
      for (const controller of controllers) controller.abort(abortError());
      return controllers.size;
    }

    function snapshot() {
      return {
        version: VERSION,
        inFlight: inFlight.size,
        activeBySource: Object.fromEntries(activeBySource),
        queuedBySource: Object.fromEntries([...queueBySource.entries()].map(([key, rows]) => [key, rows.length])),
        activeGroups: Object.fromEntries([...controllersByGroup.entries()].map(([key, rows]) => [key, rows.size])),
        trace: trace.slice()
      };
    }

    return Object.freeze({ version: VERSION, requestText, cancelGroup, snapshot });
  }

  root.TwStockRequestBroker = Object.freeze({
    version: VERSION,
    DEFAULT_TIMEOUT_MS,
    DEFAULT_MAX_RESPONSE_BYTES,
    sourceKeyForUrl,
    inferExpectedType,
    parseRetryAfter,
    detectChallenge,
    validateResponseText,
    classifyFailure,
    createRequestBroker
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
