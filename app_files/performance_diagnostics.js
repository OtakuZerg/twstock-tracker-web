"use strict";

(function attachPerformanceDiagnostics(global) {
  const VERSION = "performance-diagnostics-v1";
  const SLOW_BLOCK_LIMIT = 10;

  function nowMs() {
    if (global.performance && typeof global.performance.now === "function") {
      return global.performance.now();
    }
    return Date.now();
  }

  function isoNow() {
    try {
      return new Date().toISOString();
    } catch (_) {
      return "";
    }
  }

  function finiteNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function durationSince(startedAt) {
    const start = finiteNumber(startedAt);
    if (start === null) return null;
    return Math.max(0, nowMs() - start);
  }

  function ensureObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function ensure(performanceState) {
    const root = ensureObject(performanceState);
    const current = ensureObject(root.diagnostics);
    root.diagnostics = {
      version: VERSION,
      updatedAt: current.updatedAt || "",
      seedLoad: ensureObject(current.seedLoad),
      activeTab: ensureObject(current.activeTab),
      caches: ensureObject(current.caches),
      slowRenderBlocks: Array.isArray(current.slowRenderBlocks) ? current.slowRenderBlocks.slice(0, SLOW_BLOCK_LIMIT) : []
    };
    return root;
  }

  function touch(root) {
    root.diagnostics.updatedAt = isoNow();
  }

  function recordSeedLoad(performanceState, entry = {}) {
    const root = ensure(performanceState);
    root.diagnostics.seedLoad = {
      source: String(entry.source || ""),
      seedLabel: String(entry.seedLabel || ""),
      seedApplied: entry.seedApplied === true,
      durationMs: finiteNumber(entry.durationMs),
      quoteCount: finiteNumber(entry.quoteCount),
      klineCount: finiteNumber(entry.klineCount),
      heavyCacheMode: String(entry.heavyCacheMode || ""),
      recordedAt: isoNow()
    };
    touch(root);
    return root;
  }

  function recordActiveTabRender(performanceState, entry = {}) {
    const root = ensure(performanceState);
    const tab = String(entry.tab || "unknown");
    const byTab = ensureObject(root.diagnostics.activeTab.byTab);
    const previous = ensureObject(byTab[tab]);
    const durationMs = finiteNumber(entry.durationMs);
    byTab[tab] = {
      count: (finiteNumber(previous.count) || 0) + 1,
      lastDurationMs: durationMs,
      maxDurationMs: Math.max(finiteNumber(previous.maxDurationMs) || 0, durationMs || 0),
      renderedAt: isoNow()
    };
    root.diagnostics.activeTab = {
      lastTab: tab,
      lastDurationMs: durationMs,
      lastScope: String(entry.scope || ""),
      renderedAt: isoNow(),
      byTab
    };
    touch(root);
    return root;
  }

  function recordCache(performanceState, name, outcome) {
    const root = ensure(performanceState);
    const key = String(name || "unknown");
    const caches = root.diagnostics.caches;
    const row = ensureObject(caches[key]);
    const normalized = ["hit", "miss", "bypass"].includes(outcome) ? outcome : "miss";
    row[normalized] = (finiteNumber(row[normalized]) || 0) + 1;
    row.lastOutcome = normalized;
    row.updatedAt = isoNow();
    caches[key] = row;
    touch(root);
    return root;
  }

  function recordRenderBlock(performanceState, entry = {}) {
    const root = ensure(performanceState);
    const durationMs = finiteNumber(entry.durationMs);
    if (durationMs === null) return root;
    const block = {
      name: String(entry.name || "unknown"),
      tab: String(entry.tab || ""),
      fallbackId: String(entry.fallbackId || ""),
      ok: entry.ok !== false,
      durationMs,
      renderedAt: isoNow()
    };
    const rows = Array.isArray(root.diagnostics.slowRenderBlocks)
      ? root.diagnostics.slowRenderBlocks.slice()
      : [];
    rows.push(block);
    rows.sort((a, b) => (finiteNumber(b.durationMs) || 0) - (finiteNumber(a.durationMs) || 0));
    root.diagnostics.slowRenderBlocks = rows.slice(0, SLOW_BLOCK_LIMIT);
    touch(root);
    return root;
  }

  function cacheRows(caches) {
    return Object.entries(ensureObject(caches)).map(([name, row]) => {
      const hit = finiteNumber(row.hit) || 0;
      const miss = finiteNumber(row.miss) || 0;
      const bypass = finiteNumber(row.bypass) || 0;
      const total = hit + miss;
      return {
        name,
        hit,
        miss,
        bypass,
        hitRate: total ? hit / total : null,
        lastOutcome: String(row.lastOutcome || ""),
        updatedAt: String(row.updatedAt || "")
      };
    }).sort((a, b) => (b.hit + b.miss + b.bypass) - (a.hit + a.miss + a.bypass));
  }

  function summarize(performanceState) {
    const root = ensure(performanceState);
    const diagnostics = root.diagnostics;
    return {
      version: VERSION,
      updatedAt: diagnostics.updatedAt || "",
      seedLoad: ensureObject(diagnostics.seedLoad),
      activeTab: ensureObject(diagnostics.activeTab),
      cacheRows: cacheRows(diagnostics.caches),
      slowRenderBlocks: Array.isArray(diagnostics.slowRenderBlocks) ? diagnostics.slowRenderBlocks.slice(0, SLOW_BLOCK_LIMIT) : []
    };
  }

  global.TwStockPerformanceDiagnostics = {
    version: VERSION,
    nowMs,
    durationSince,
    ensure,
    recordSeedLoad,
    recordActiveTabRender,
    recordCache,
    recordRenderBlock,
    summarize
  };
})(typeof window !== "undefined" ? window : globalThis);
