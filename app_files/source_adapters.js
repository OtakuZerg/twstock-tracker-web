"use strict";

(function attachSourceAdapters(root) {
  const VERSION = "source-adapters-v1";
  const DEFINITIONS = Object.freeze({
    twse: { label: "TWSE", tier: 1, timeoutMs: 12000, concurrency: 3, expectedType: "json", minRows: 1 },
    tpex: { label: "TPEx", tier: 1, timeoutMs: 12000, concurrency: 3, expectedType: "json", minRows: 1 },
    mops: { label: "MOPS", tier: 1, timeoutMs: 15000, concurrency: 2, expectedType: "json", minRows: 1 },
    yahoo: { label: "Yahoo Finance", tier: 2, timeoutMs: 12000, concurrency: 4, expectedType: "json", minRows: 1 },
    taifex: { label: "TAIFEX", tier: 1, timeoutMs: 15000, concurrency: 2, expectedType: "json", minRows: 1 },
    tdcc: { label: "TDCC", tier: 1, timeoutMs: 15000, concurrency: 2, expectedType: "json", minRows: 1 },
    macro: { label: "總經來源", tier: 1, timeoutMs: 15000, concurrency: 2, expectedType: "auto", minRows: 1 },
    tide: { label: "Tide", tier: 2, timeoutMs: 12000, concurrency: 2, expectedType: "json", minRows: 1 }
  });

  function adapterError(message, code, category = "schema") {
    const error = new Error(message);
    error.code = code;
    error.category = category;
    error.retryable = false;
    return error;
  }

  function definition(key) {
    const row = DEFINITIONS[String(key || "").toLowerCase()];
    if (!row) throw adapterError(`未知來源 adapter：${key}`, "SOURCE_ADAPTER_UNKNOWN");
    return row;
  }

  function rowsAt(payload, paths = []) {
    const candidates = Array.isArray(paths) ? paths : [paths];
    for (const candidate of candidates) {
      const parts = String(candidate || "").split(".").filter(Boolean);
      let value = payload;
      for (const part of parts) value = value?.[part];
      if (Array.isArray(value)) return value;
    }
    if (Array.isArray(payload)) return payload;
    return null;
  }

  function validateRows(payload, options = {}) {
    const rows = rowsAt(payload, options.paths || []);
    if (!rows) throw adapterError(`${options.label || "來源"}缺少預期資料列`, "SOURCE_ROWS_MISSING");
    const minRows = Math.max(1, Number(options.minRows) || 1);
    if (rows.length < minRows) throw adapterError(`${options.label || "來源"}回傳 0 筆或筆數不足`, "SOURCE_ZERO_ROWS", "no-data");
    const requiredFields = Array.isArray(options.requiredFields) ? options.requiredFields.filter(Boolean) : [];
    if (requiredFields.length) {
      const valid = rows.some((row) => row && typeof row === "object" && requiredFields.every((field) => row[field] !== undefined && row[field] !== null && row[field] !== ""));
      if (!valid) throw adapterError(`${options.label || "來源"}欄位結構已變更`, "SOURCE_SCHEMA_DRIFT");
    }
    return rows;
  }

  function parseJson(text, options = {}) {
    let payload;
    try {
      payload = JSON.parse(String(text || ""));
    } catch (error) {
      throw adapterError(`${options.label || "來源"} JSON 解析失敗：${error.message}`, "SOURCE_JSON_INVALID");
    }
    return options.paths || options.requiredFields
      ? validateRows(payload, options)
      : payload;
  }

  function brokerOptions(key, overrides = {}) {
    const row = definition(key);
    return {
      sourceKey: String(key).toLowerCase(),
      timeoutMs: row.timeoutMs,
      concurrency: row.concurrency,
      expectedType: row.expectedType,
      retryLimit: row.tier === 1 ? 1 : 0,
      ...overrides
    };
  }

  root.TwStockSourceAdapters = Object.freeze({
    version: VERSION,
    definitions: DEFINITIONS,
    definition,
    brokerOptions,
    rowsAt,
    validateRows,
    parseJson
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
