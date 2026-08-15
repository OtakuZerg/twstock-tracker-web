(function initTwStockFundamentalDataNormalizers(root) {
  "use strict";

  const VERSION = "fundamental-data-normalizers-v1";

  function adapters() {
    const value = root.TwStockSourceAdapters;
    if (!value?.parseJson || !value?.validateRows || !value?.definition) {
      const error = new Error("TwStockSourceAdapters 尚未載入");
      error.code = "SOURCE_ADAPTER_MISSING";
      throw error;
    }
    return value;
  }

  function sourceError(message, code, category = "schema") {
    const error = new Error(message);
    error.code = code;
    error.category = category;
    error.retryable = false;
    return error;
  }

  function toNumber(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).replace(/,/g, "").replace(/%/g, "").trim();
    if (!text || text === "-" || /^null$/i.test(text) || /^n\/?a$/i.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  function officialTextValue(value) {
    const text = String(value ?? "").replace(/\u3000/g, " ").trim();
    if (!text || text === "-" || /^n\/?a$/i.test(text) || /^null$/i.test(text)) return "";
    return text;
  }

  function parseCsvLine(line) {
    const cells = [];
    let cell = "";
    let quoted = false;
    const text = String(line || "");
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '"') {
        if (quoted && text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === "," && !quoted) {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += char;
      }
    }
    cells.push(cell.trim());
    return cells.map((value) => value.replace(/^\uFEFF/, "").replace(/^"|"$/g, ""));
  }

  function parseCsvTable(text, label = "CSV") {
    const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) throw sourceError(`${label} 回傳 0 筆`, "SOURCE_ZERO_ROWS", "no-data");
    const headers = parseCsvLine(lines[0]);
    if (!headers.some(Boolean)) throw sourceError(`${label} 缺少表頭`, "SOURCE_SCHEMA_DRIFT");
    const rows = lines.slice(1).map((line) => {
      const cells = parseCsvLine(line);
      return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    });
    if (!rows.length) throw sourceError(`${label} 回傳 0 筆`, "SOURCE_ZERO_ROWS", "no-data");
    return rows;
  }

  function normalizeMonthKey(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{4})[-/]?(\d{2})/);
    if (match) {
      const month = Number(match[2]);
      return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : "";
    }
    const digits = text.replace(/\D/g, "");
    if (digits.length === 6 && Number(digits.slice(0, 4)) >= 1900) {
      const month = Number(digits.slice(4, 6));
      if (month >= 1 && month <= 12) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
    }
    if (digits.length === 5 || digits.length === 4) {
      const yearLength = digits.length - 2;
      const rocYear = Number(digits.slice(0, yearLength));
      const month = Number(digits.slice(yearLength));
      if (rocYear > 0 && month >= 1 && month <= 12) {
        return `${rocYear + 1911}-${String(month).padStart(2, "0")}`;
      }
    }
    return "";
  }

  function shiftMonthKey(year, month, offset) {
    const date = new Date(Date.UTC(year, month - 1 + offset, 1, 12));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  function parseRocCompactDate(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 8 && Number(digits.slice(0, 4)) >= 1900) {
      return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    }
    if (digits.length === 7) return `${Number(digits.slice(0, 3)) + 1911}-${digits.slice(3, 5)}-${digits.slice(5, 7)}`;
    if (digits.length === 6) return `${Number(digits.slice(0, 2)) + 1911}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
    return String(value || "").trim();
  }

  function monthKeyFromRevenueRow(row, fallbackDate = new Date()) {
    const keys = ["資料年月", "營收年月", "年月", "出表年月", "出表日期", "Date", "RevenueMonth", "YearMonth"];
    for (const key of keys) {
      const raw = String(row?.[key] || "").trim();
      const monthKey = normalizeMonthKey(raw);
      if (monthKey) return monthKey;
      const rocMatch = raw.match(/^(\d{2,3})\D+(\d{1,2})/);
      if (rocMatch) {
        const rocYear = Number(rocMatch[1]);
        const rocMonth = Number(rocMatch[2]);
        if (rocYear > 0 && rocMonth >= 1 && rocMonth <= 12) {
          return `${rocYear + 1911}-${String(rocMonth).padStart(2, "0")}`;
        }
      }
    }
    const year = toNumber(row?.["年度"] ?? row?.["年"] ?? row?.Year);
    const month = toNumber(row?.["月份"] ?? row?.["月"] ?? row?.Month);
    if (year !== null && month !== null && month >= 1 && month <= 12) {
      const fullYear = year < 1911 ? year + 1911 : year;
      return `${fullYear}-${String(Math.round(month)).padStart(2, "0")}`;
    }
    const fallback = fallbackDate instanceof Date ? fallbackDate : new Date(fallbackDate || Date.now());
    if (Number.isNaN(fallback.getTime())) return "";
    return shiftMonthKey(fallback.getUTCFullYear(), fallback.getUTCMonth() + 1, -1);
  }

  function rowFirstValue(row, keys) {
    for (const key of keys) {
      const value = row?.[key];
      if (officialTextValue(value)) return value;
    }
    return "";
  }

  function monthlyRevenueSourceLabel(market, fallbackUsed = false) {
    if (fallbackUsed) return market === "listed" ? "TWSE monthlyRevenue OpenAPI" : "TPEx mtp_aabc_otc OpenAPI";
    return market === "listed" ? "MOPS t187ap05_L 月營收 CSV" : "MOPS t187ap05_O 月營收 CSV";
  }

  function normalizeMonthlyRevenueRow(row, fetchedAt, market, options = {}) {
    const fallbackUsed = options.fallbackUsed === true;
    return {
      current: toNumber(rowFirstValue(row, ["營業收入-當月營收", "當月營收", "Revenue"])),
      prevMonth: toNumber(rowFirstValue(row, ["營業收入-上月營收", "上月營收"])),
      prevYear: toNumber(rowFirstValue(row, ["營業收入-去年當月營收", "去年當月營收"])),
      momPct: toNumber(rowFirstValue(row, ["營業收入-上月比較增減(%)", "上月比較增減(%)", "MoM(%)"])),
      yoyPct: toNumber(rowFirstValue(row, ["營業收入-去年同月增減(%)", "去年同月增減(%)", "YoY(%)"])),
      cumulative: toNumber(rowFirstValue(row, ["累計營業收入-當月累計營收", "當月累計營收"])),
      cumulativePrevYear: toNumber(rowFirstValue(row, ["累計營業收入-去年累計營收", "去年累計營收"])),
      cumYoyPct: toNumber(rowFirstValue(row, ["累計營業收入-前期比較增減(%)", "前期比較增減(%)"])),
      yearMonth: monthKeyFromRevenueRow(row, fetchedAt),
      sourceDate: parseRocCompactDate(row?.["出表日期"]),
      companyName: String(row?.["公司名稱"] || row?.Name || "").trim(),
      industry: String(row?.["產業別"] || row?.Industry || "").trim(),
      note: String(row?.["備註"] || row?.Note || "").trim(),
      source: options.source || monthlyRevenueSourceLabel(market, fallbackUsed),
      sourceUrl: options.sourceUrl || "",
      sourceTier: options.sourceTier || "Tier 1 官方",
      fallbackUsed,
      fetchedAt
    };
  }

  function revenueCode(row) {
    return String(row?.["公司代號"] || row?.CompanyID || row?.code || "").trim().toUpperCase();
  }

  function normalizeRevenueRows(rows, source, fetchedAt, fallbackUsed) {
    const normalized = rows.map((row) => {
      const code = revenueCode(row);
      if (!code) return null;
      return {
        code,
        row: normalizeMonthlyRevenueRow(row, fetchedAt, source.market, {
          source: source.label,
          sourceUrl: source.url,
          sourceTier: source.sourceTier,
          fallbackUsed
        })
      };
    }).filter(Boolean);
    if (!normalized.length) throw sourceError(`${source.label || "月營收來源"} 缺少公司代號欄位`, "SOURCE_SCHEMA_DRIFT");
    return normalized;
  }

  function parseMonthlyRevenueCsv(text, source = {}, fetchedAt = new Date().toISOString()) {
    const rows = parseCsvTable(text, source.label || "MOPS 月營收 CSV");
    return normalizeRevenueRows(rows, source, fetchedAt, false);
  }

  function parseMonthlyRevenueJson(input, source = {}, fetchedAt = new Date().toISOString()) {
    const sourceKey = source.sourceKey || (source.market === "otc" ? "tpex" : "twse");
    const sourceAdapters = adapters();
    sourceAdapters.definition(sourceKey);
    const payload = typeof input === "string"
      ? sourceAdapters.parseJson(input, { label: source.label || "月營收 OpenAPI" })
      : input;
    const rows = sourceAdapters.validateRows(payload, { minRows: 1, label: source.label || "月營收 OpenAPI" });
    return normalizeRevenueRows(rows, source, fetchedAt, true);
  }

  function rowFirstText(row, keys) {
    for (const key of keys) {
      const value = row?.[key];
      if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
    }
    return "";
  }

  function rowFirstNumber(row, keys) {
    for (const key of keys) {
      const value = toNumber(row?.[key]);
      if (value !== null) return value;
    }
    return null;
  }

  function normalizeQuarterKey(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    let match = text.match(/^(\d{4})[-/\s]?[Qq季]?([1-4])$/);
    if (match) return `${match[1]}Q${match[2]}`;
    match = text.match(/^(\d{4}).*第?\s*([1-4])\s*季/);
    if (match) return `${match[1]}Q${match[2]}`;
    match = text.match(/^(\d{2,3}).*第?\s*([1-4])\s*季/);
    if (match) return `${Number(match[1]) + 1911}Q${match[2]}`;
    match = text.match(/^(\d{2,3})[-/\s]?[Qq季]?([1-4])$/);
    if (match) return `${Number(match[1]) + 1911}Q${match[2]}`;
    return text;
  }

  function marginPctFromAmounts(numerator, denominator) {
    const num = toNumber(numerator);
    const den = toNumber(denominator);
    if (num === null || den === null || den === 0) return null;
    return num / den * 100;
  }

  function normalizeQuarterlyMarginRow(row, source = {}, fetchedAt = new Date().toISOString(), options = {}) {
    const code = rowFirstText(row, ["公司代號", "代號", "股票代號", "code", "Code"]).toUpperCase();
    if (!code) return null;
    const period = normalizeQuarterKey(rowFirstText(row, ["期間", "年度季別", "年季", "季別", "quarter", "period", "yearQuarter"]));
    if (!period) return null;
    const revenue = rowFirstNumber(row, ["營業收入", "營業收入合計", "收入", "收益", "revenue", "operatingRevenue", "netRevenue"]);
    const grossProfit = rowFirstNumber(row, ["營業毛利", "營業毛利（毛損）", "營業毛利(毛損)", "毛利", "grossProfit"]);
    const operatingIncome = rowFirstNumber(row, ["營業利益", "營業利益（損失）", "營業利益(損失)", "營益", "operatingIncome"]);
    const netIncome = rowFirstNumber(row, ["本期淨利", "本期淨利（淨損）", "本期淨利(淨損)", "稅後淨利", "淨利", "netIncome"]);
    const grossMargin = rowFirstNumber(row, ["毛利率", "營業毛利率", "grossMargin", "grossProfitMargin"]) ?? marginPctFromAmounts(grossProfit, revenue);
    const operatingMargin = rowFirstNumber(row, ["營益率", "營業利益率", "operatingMargin", "operatingProfitMargin"]) ?? marginPctFromAmounts(operatingIncome, revenue);
    const netMargin = rowFirstNumber(row, ["淨利率", "稅後淨利率", "netMargin", "netProfitMargin"]) ?? marginPctFromAmounts(netIncome, revenue);
    if (grossMargin === null && operatingMargin === null && netMargin === null) return null;
    return {
      code,
      name: rowFirstText(row, ["公司名稱", "名稱", "name"]) || options.nameForCode?.(code) || code,
      period,
      revenue,
      grossProfit,
      operatingIncome,
      netIncome,
      grossMargin,
      operatingMargin,
      netMargin,
      source: source.label || "MOPS 季損益表匯入",
      sourceTier: source.sourceTier || "Tier 1 官方 / 本機匯入",
      sourceUrl: source.url || options.defaultSourceUrl || "",
      fallbackUsed: source.fallbackUsed === true,
      fetchedAt,
      asOf: period
    };
  }

  function parseQuarterlyMarginCsv(text, source = {}, fetchedAt = new Date().toISOString(), options = {}) {
    const rows = parseCsvTable(text, source.label || "季財報三率 CSV")
      .map((row) => normalizeQuarterlyMarginRow(row, source, fetchedAt, options))
      .filter(Boolean);
    if (!rows.length) throw sourceError("季財報 CSV 未含可解析的公司代號、期間與三率欄位", "SOURCE_SCHEMA_DRIFT");
    return rows;
  }

  const api = Object.freeze({
    version: VERSION,
    parseCsvLine,
    parseCsvTable,
    normalizeMonthKey,
    monthKeyFromRevenueRow,
    monthlyRevenueSourceLabel,
    normalizeMonthlyRevenueRow,
    parseMonthlyRevenueCsv,
    parseMonthlyRevenueJson,
    normalizeQuarterKey,
    marginPctFromAmounts,
    normalizeQuarterlyMarginRow,
    parseQuarterlyMarginCsv
  });

  root.TwStockFundamentalDataNormalizers = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
