"use strict";

(function initUpdateReliability(root) {
  const CIRCUIT_FAILURE_THRESHOLD = 3;
  const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
  const RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;
  const MAX_HISTORY = 12;

  const SOURCE_LABELS = {
    "twse.com.tw": "TWSE",
    "tpex.org.tw": "TPEx",
    "mops.twse.com.tw": "MOPS",
    "mis.twse.com.tw": "TWSE MIS",
    "taifex.com.tw": "TAIFEX",
    "tdcc.com.tw": "TDCC",
    "yahoo.com": "Yahoo Finance",
    "tide-tw.app": "Tide",
    "trendforce.com": "TrendForce",
    "federalreserve.gov": "Federal Reserve",
    "treasury.gov": "U.S. Treasury",
    "cbc.gov.tw": "中央銀行",
    "cboe.com": "Cboe",
    "anue.com": "鉅亨網"
  };

  function isoNow(nowMs = Date.now()) {
    return new Date(nowMs).toISOString();
  }

  function sourceKeyForUrl(rawUrl) {
    try {
      const host = new URL(String(rawUrl || ""), "https://local.invalid/").hostname.toLowerCase().replace(/^www\./, "");
      if (!host || host === "local.invalid") return "local";
      if (host.endsWith("twse.com.tw")) return host.startsWith("mis.") ? "mis.twse.com.tw" : host.startsWith("mops.") ? "mops.twse.com.tw" : "twse.com.tw";
      if (host.endsWith("tpex.org.tw")) return "tpex.org.tw";
      if (host.endsWith("taifex.com.tw")) return "taifex.com.tw";
      if (host.endsWith("tdcc.com.tw")) return "tdcc.com.tw";
      if (host.endsWith("yahoo.com") || host.endsWith("yahooapis.com")) return "yahoo.com";
      if (host.endsWith("trendforce.com") || host.endsWith("dramexchange.com")) return "trendforce.com";
      if (host.endsWith("federalreserve.gov")) return "federalreserve.gov";
      if (host.endsWith("treasury.gov")) return "treasury.gov";
      if (host.endsWith("cbc.gov.tw")) return "cbc.gov.tw";
      if (host.endsWith("cboe.com")) return "cboe.com";
      if (host.endsWith("anue.com")) return "anue.com";
      return host;
    } catch (_) {
      return "invalid-url";
    }
  }

  function sourceLabel(key) {
    return SOURCE_LABELS[key] || key || "未知來源";
  }

  function classifyFailure(error) {
    const message = String(error?.message || error || "未知錯誤");
    const code = String(error?.code || "").toUpperCase();
    const explicitCategory = String(error?.category || "").toLowerCase();
    const lower = `${code} ${explicitCategory} ${message}`.toLowerCase();
    const statusMatch = message.match(/(?:http\s*)?(\d{3})/i);
    const explicitStatus = Number(error?.status);
    const status = Number.isFinite(explicitStatus) && explicitStatus > 0
      ? explicitStatus
      : (statusMatch ? Number(statusMatch[1]) : null);
    if (lower.includes("circuit") || lower.includes("暫停重試")) {
      return { category: "circuit-open", label: "來源暫停重試", retryable: true, cooldownMs: DEFAULT_COOLDOWN_MS, status };
    }
    if (explicitCategory === "cancelled" || code === "REQUEST_CANCELLED" || lower.includes("已取消")) {
      return { category: "cancelled", label: "使用者取消", retryable: false, cooldownMs: 0, status };
    }
    if (status === 429 || lower.includes("rate limit") || lower.includes("too many requests")) {
      return { category: "rate-limit", label: "來源限流", retryable: true, cooldownMs: RATE_LIMIT_COOLDOWN_MS, status };
    }
    if (lower.includes("timeout") || lower.includes("逾時") || lower.includes("aborterror")) {
      return { category: "timeout", label: "來源逾時", retryable: true, cooldownMs: DEFAULT_COOLDOWN_MS, status };
    }
    if (lower.includes("公開網站不直接") || lower.includes("same-origin") || lower.includes("cors")) {
      return { category: "runtime-boundary", label: "Web／Extension 邊界", retryable: false, cooldownMs: 0, status };
    }
    if (["waf-challenge", "waf-blocked"].includes(explicitCategory) || lower.includes("waf") || lower.includes("access denied") || lower.includes("forbidden")) {
      return { category: explicitCategory || "waf-blocked", label: "來源阻擋／驗證頁", retryable: false, cooldownMs: RATE_LIMIT_COOLDOWN_MS, status };
    }
    if (explicitCategory === "response-too-large" || code === "RESPONSE_TOO_LARGE") {
      return { category: "response-too-large", label: "來源回應過大", retryable: false, cooldownMs: 0, status };
    }
    if (explicitCategory === "redirect" || (status !== null && status >= 300 && status < 400)) {
      return { category: "redirect", label: `來源重新導向${status ? `（HTTP ${status}）` : ""}`, retryable: false, cooldownMs: 0, status };
    }
    if (lower.includes("schema") || lower.includes("格式不相容") || lower.includes("parse") || lower.includes("解析")) {
      return { category: "schema", label: "來源格式改版／解析失敗", retryable: false, cooldownMs: RATE_LIMIT_COOLDOWN_MS, status };
    }
    if (lower.includes("no data") || lower.includes("無資料") || lower.includes("0 rows") || lower.includes("空資料")) {
      return { category: "no-data", label: "該期無資料", retryable: false, cooldownMs: 0, status };
    }
    if (status) {
      return { category: "http", label: `HTTP ${status}`, retryable: status >= 500 || status === 408, cooldownMs: status >= 500 ? DEFAULT_COOLDOWN_MS : 0, status };
    }
    if (explicitCategory === "dns" || lower.includes("name_not_resolved") || lower.includes("enotfound")) {
      return { category: "dns", label: "DNS 解析失敗", retryable: true, cooldownMs: DEFAULT_COOLDOWN_MS, status };
    }
    if (explicitCategory === "tls" || lower.includes("certificate") || lower.includes("ssl")) {
      return { category: "tls", label: "TLS／憑證失敗", retryable: true, cooldownMs: DEFAULT_COOLDOWN_MS, status };
    }
    if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("連線失敗") || lower.includes("runtime.lastError")) {
      return { category: "network", label: "網路／背景服務失敗", retryable: true, cooldownMs: DEFAULT_COOLDOWN_MS, status };
    }
    return { category: "unknown", label: "未分類錯誤", retryable: true, cooldownMs: DEFAULT_COOLDOWN_MS, status };
  }

  function normalizeEntry(raw, key = "") {
    const entry = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return {
      key: key || entry.key || "unknown",
      label: entry.label || sourceLabel(key || entry.key),
      lastAttempt: entry.lastAttempt || null,
      lastSuccess: entry.lastSuccess || null,
      lastFailure: entry.lastFailure || null,
      lastStatus: Number(entry.lastStatus) || null,
      lastBytes: Number(entry.lastBytes) || 0,
      lastLatencyMs: Number(entry.lastLatencyMs) || 0,
      parsedRows: Number.isFinite(Number(entry.parsedRows)) ? Number(entry.parsedRows) : null,
      schemaVersion: entry.schemaVersion || null,
      consecutiveFailures: Math.max(0, Number(entry.consecutiveFailures) || 0),
      nextRetryAt: entry.nextRetryAt || null,
      lastCategory: entry.lastCategory || "",
      lastCategoryLabel: entry.lastCategoryLabel || "",
      lastError: entry.lastError || "",
      fallbackAgeMs: Number.isFinite(Number(entry.fallbackAgeMs)) ? Number(entry.fallbackAgeMs) : null,
      requestCount: Math.max(0, Number(entry.requestCount) || 0),
      successCount: Math.max(0, Number(entry.successCount) || 0),
      failureCount: Math.max(0, Number(entry.failureCount) || 0),
      history: Array.isArray(entry.history) ? entry.history.slice(-MAX_HISTORY) : []
    };
  }

  function normalizeRegistry(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, normalizeEntry(value, key)]));
  }

  function appendHistory(entry, item) {
    entry.history = [...entry.history, item].slice(-MAX_HISTORY);
    return entry;
  }

  function canAttempt(registry, key, nowMs = Date.now(), bypassCircuit = false) {
    const entry = normalizeEntry(registry?.[key], key);
    const retryAt = Date.parse(entry.nextRetryAt || "");
    if (!bypassCircuit && Number.isFinite(retryAt) && retryAt > nowMs) {
      return { allowed: false, retryAt: entry.nextRetryAt, entry };
    }
    return { allowed: true, retryAt: null, entry };
  }

  function recordAttempt(registry, key, meta = {}) {
    const nowMs = Number(meta.nowMs) || Date.now();
    const entry = normalizeEntry(registry[key], key);
    entry.label = meta.label || entry.label || sourceLabel(key);
    entry.lastAttempt = isoNow(nowMs);
    entry.requestCount += 1;
    registry[key] = appendHistory(entry, { at: entry.lastAttempt, status: "attempt", url: meta.url || "" });
    return registry[key];
  }

  function recordSuccess(registry, key, meta = {}) {
    const nowMs = Number(meta.nowMs) || Date.now();
    const entry = normalizeEntry(registry[key], key);
    entry.lastAttempt = entry.lastAttempt || isoNow(nowMs);
    entry.lastSuccess = isoNow(nowMs);
    entry.lastStatus = Number(meta.status) || 200;
    entry.lastBytes = Math.max(0, Number(meta.bytes) || 0);
    entry.lastLatencyMs = Math.max(0, Number(meta.latencyMs) || 0);
    entry.parsedRows = Number.isFinite(Number(meta.parsedRows)) ? Number(meta.parsedRows) : entry.parsedRows;
    entry.schemaVersion = meta.schemaVersion || entry.schemaVersion;
    entry.fallbackAgeMs = Number.isFinite(Number(meta.fallbackAgeMs)) ? Number(meta.fallbackAgeMs) : entry.fallbackAgeMs;
    entry.consecutiveFailures = 0;
    entry.nextRetryAt = null;
    entry.lastCategory = "success";
    entry.lastCategoryLabel = "成功";
    entry.lastError = "";
    entry.successCount += 1;
    registry[key] = appendHistory(entry, { at: entry.lastSuccess, status: "success", httpStatus: entry.lastStatus, bytes: entry.lastBytes, latencyMs: entry.lastLatencyMs });
    return registry[key];
  }

  function recordFailure(registry, key, error, meta = {}) {
    const nowMs = Number(meta.nowMs) || Date.now();
    const classified = classifyFailure(error);
    const entry = normalizeEntry(registry[key], key);
    entry.lastAttempt = entry.lastAttempt || isoNow(nowMs);
    if (classified.category === "cancelled" || classified.category === "runtime-boundary") {
      entry.lastCategory = classified.category;
      entry.lastCategoryLabel = classified.label;
      entry.lastError = String(error?.message || error || classified.label).slice(0, 280);
      registry[key] = appendHistory(entry, {
        at: isoNow(nowMs),
        status: classified.category === "cancelled" ? "cancelled" : "blocked",
        category: classified.category,
        error: entry.lastError,
        httpStatus: Number(meta.status || classified.status) || null
      });
      return registry[key];
    }
    entry.lastFailure = isoNow(nowMs);
    entry.lastStatus = Number(meta.status || classified.status) || null;
    entry.lastLatencyMs = Math.max(0, Number(meta.latencyMs) || 0);
    entry.lastCategory = classified.category;
    entry.lastCategoryLabel = classified.label;
    entry.lastError = String(error?.message || error || classified.label).slice(0, 280);
    entry.consecutiveFailures += 1;
    entry.failureCount += 1;
    if (classified.retryable && entry.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
      const multiplier = Math.min(4, entry.consecutiveFailures - CIRCUIT_FAILURE_THRESHOLD + 1);
      entry.nextRetryAt = isoNow(nowMs + classified.cooldownMs * multiplier);
    } else if (!classified.retryable) {
      entry.nextRetryAt = null;
    }
    registry[key] = appendHistory(entry, { at: entry.lastFailure, status: "failure", category: classified.category, error: entry.lastError, httpStatus: entry.lastStatus });
    return registry[key];
  }

  function resetCircuit(registry, key) {
    const entry = normalizeEntry(registry[key], key);
    entry.consecutiveFailures = 0;
    entry.nextRetryAt = null;
    registry[key] = entry;
    return entry;
  }

  function healthRows(registry) {
    return Object.values(normalizeRegistry(registry)).sort((left, right) => {
      const leftBlocked = Date.parse(left.nextRetryAt || "") > Date.now() ? 1 : 0;
      const rightBlocked = Date.parse(right.nextRetryAt || "") > Date.now() ? 1 : 0;
      if (leftBlocked !== rightBlocked) return rightBlocked - leftBlocked;
      if (left.consecutiveFailures !== right.consecutiveFailures) return right.consecutiveFailures - left.consecutiveFailures;
      return (Date.parse(right.lastAttempt || "") || 0) - (Date.parse(left.lastAttempt || "") || 0);
    });
  }

  root.TwStockUpdateReliability = Object.freeze({
    version: "source-health-v2",
    CIRCUIT_FAILURE_THRESHOLD,
    sourceKeyForUrl,
    sourceLabel,
    classifyFailure,
    normalizeEntry,
    normalizeRegistry,
    canAttempt,
    recordAttempt,
    recordSuccess,
    recordFailure,
    resetCircuit,
    healthRows
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
