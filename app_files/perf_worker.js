"use strict";

try {
  importScripts("analysis_frameworks.js");
} catch (_) {
  // The main thread keeps a fallback scorer when worker imports are unavailable.
}

self.addEventListener("message", (event) => {
  const message = event.data || {};
  const id = message.id;
  try {
    if (message.type === "ping") {
      self.postMessage({ id, ok: true, type: "pong", version: message.payload?.version || "" });
      return;
    }
    if (message.type === "sliceRows") {
      const rows = Array.isArray(message.payload?.rows) ? message.payload.rows : [];
      const limit = Math.max(0, Number(message.payload?.limit) || 0);
      self.postMessage({
        id,
        ok: true,
        value: {
          rows: limit ? rows.slice(0, limit) : rows,
          total: rows.length,
          shown: limit ? Math.min(rows.length, limit) : rows.length
        }
      });
      return;
    }
    if (message.type === "windowRows") {
      const rows = Array.isArray(message.payload?.rows) ? message.payload.rows : [];
      const start = Math.max(0, Number(message.payload?.start) || 0);
      const size = Math.max(0, Number(message.payload?.size) || 0);
      const end = size ? start + size : rows.length;
      self.postMessage({
        id,
        ok: true,
        value: {
          rows: rows.slice(start, end),
          total: rows.length,
          start,
          shown: Math.max(0, Math.min(rows.length, end) - Math.min(rows.length, start)),
          end: Math.min(rows.length, end)
        }
      });
      return;
    }
    if (message.type === "analystWinRateBatch") {
      const rows = Array.isArray(message.payload?.rows) ? message.payload.rows : [];
      const limit = Math.max(0, Number(message.payload?.limit) || 0);
      const scorer = self.TwStockAnalysisFrameworks?.scoreAnalystWinRateBatch;
      if (typeof scorer !== "function") throw new Error("Analysis framework unavailable in worker");
      const scored = scorer(rows, {
        limit,
        calibrations: message.payload?.calibrations || null
      });
      self.postMessage({
        id,
        ok: true,
        value: {
          rows: scored,
          total: rows.length,
          shown: scored.length,
          methodVersion: self.TwStockAnalysisFrameworks.version
        }
      });
      return;
    }
    self.postMessage({ id, ok: false, error: `Unknown worker task: ${message.type || ""}` });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error && error.message ? error.message : String(error) });
  }
});
