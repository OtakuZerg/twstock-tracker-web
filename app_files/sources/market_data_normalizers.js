(function initTwStockMarketDataNormalizers(root) {
  "use strict";

  const VERSION = "market-data-normalizers-v1";
  const TAIPEI_TIME_ZONE = "Asia/Taipei";

  function adapters() {
    const value = root.TwStockSourceAdapters;
    if (!value?.parseJson || !value?.validateRows || !value?.rowsAt) {
      const error = new Error("TwStockSourceAdapters 尚未載入");
      error.code = "SOURCE_ADAPTER_MISSING";
      throw error;
    }
    return value;
  }

  function toNumber(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).replace(/,/g, "").trim();
    if (!text || text === "-" || text.toLowerCase() === "null") return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  function firstNumeric(value) {
    if (value === null || value === undefined) return null;
    for (const part of String(value).split("_")) {
      const number = toNumber(part);
      if (number !== null) return number;
    }
    return null;
  }

  function numericList(value, options = {}) {
    if (value === null || value === undefined) return [];
    const min = options.min ?? null;
    return String(value)
      .split("_")
      .map(toNumber)
      .filter((number) => number !== null && (min === null || number >= min));
  }

  function officialTextValue(value) {
    const text = String(value ?? "").replace(/\u3000/g, " ").trim();
    if (!text || text === "-" || /^N\/A$/i.test(text) || /^null$/i.test(text)) return "";
    return text;
  }

  function officialNumberValue(value) {
    const text = officialTextValue(value);
    return text ? toNumber(text) : null;
  }

  function parseCompactDay(value) {
    const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})$/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
  }

  function parseRocDate(value) {
    const match = String(value || "").match(/(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (!match) return "";
    const rawYear = Number(match[1]);
    const year = rawYear < 1911 ? rawYear + 1911 : rawYear;
    return `${year}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  }

  function parseRocCompactDate(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 8 && Number(digits.slice(0, 4)) >= 1900) return parseCompactDay(digits);
    if (digits.length === 7) return `${Number(digits.slice(0, 3)) + 1911}-${digits.slice(3, 5)}-${digits.slice(5, 7)}`;
    if (digits.length === 6) return `${Number(digits.slice(0, 2)) + 1911}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
    return String(value || "").trim();
  }

  function dateKeyInTaipei(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TAIPEI_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date).reduce((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function timeKeyInTaipei(date = new Date()) {
    return new Intl.DateTimeFormat("zh-TW", {
      timeZone: TAIPEI_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(date);
  }

  function parsePayload(key, text, label) {
    const sourceAdapters = adapters();
    const source = sourceAdapters.definition(key);
    return sourceAdapters.parseJson(text, { label: label || source.label });
  }

  function validatePayloadRows(payload, options) {
    return adapters().validateRows(payload, options);
  }

  function misOrderBookFields(row) {
    const bidPrices = numericList(row?.b, { min: 0.0001 });
    const askPrices = numericList(row?.a, { min: 0.0001 });
    const bidVols = numericList(row?.g, { min: 0.0001 });
    const askVols = numericList(row?.f, { min: 0.0001 });
    const totalBid = bidVols.reduce((sum, value) => sum + value, 0);
    const totalAsk = askVols.reduce((sum, value) => sum + value, 0);
    return {
      bidPrices,
      askPrices,
      bidVols,
      askVols,
      bestBid: bidPrices[0] ?? null,
      bestAsk: askPrices[0] ?? null,
      bestBidVol: bidVols[0] ?? null,
      bestAskVol: askVols[0] ?? null,
      totalBid,
      totalAsk,
      bidAskRatio: (totalBid + totalAsk) > 0 ? totalBid / (totalBid + totalAsk) : null,
      limitUpPrice: firstNumeric(row?.u),
      limitDownPrice: firstNumeric(row?.w)
    };
  }

  function normalizeTwseMisRow(row, stock, options = {}) {
    const price = firstNumeric(row?.z) ?? firstNumeric(row?.a) ?? firstNumeric(row?.b) ?? toNumber(row?.y);
    const previousClose = toNumber(row?.y);
    if (price === null || previousClose === null) {
      const error = new Error("TWSE MIS 報價缺價格或昨收");
      error.code = "SOURCE_SCHEMA_DRIFT";
      throw error;
    }
    const change = +(price - previousClose).toFixed(2);
    const pct = previousClose ? +(change / previousClose * 100).toFixed(2) : null;
    const rowDate = row?.d && String(row.d).length === 8
      ? `${String(row.d).slice(0, 4)}-${String(row.d).slice(4, 6)}-${String(row.d).slice(6, 8)}`
      : "";
    const date = rowDate || options.fallbackDate || dateKeyInTaipei(options.now ? new Date(options.now) : new Date());
    return {
      code: String(stock?.code || row?.c || "").trim(),
      name: row?.n || stock?.name || "",
      price,
      change,
      pct,
      previousClose,
      open: firstNumeric(row?.o),
      high: firstNumeric(row?.h),
      low: firstNumeric(row?.l),
      volume: toNumber(row?.v),
      averagePrice: firstNumeric(row?.p),
      turnover: toNumber(row?.m),
      ...misOrderBookFields(row),
      source: "證交所 MIS",
      sourceKind: "official",
      sourceDate: date,
      sourceTime: row?.t || "",
      fallbackUsed: false,
      marketTime: row?.t ? `${date} ${row.t}` : date,
      capturedAt: options.capturedAt || new Date().toISOString()
    };
  }

  function parseTwseMisQuote(text, stock, options = {}) {
    const payload = parsePayload("twse", text, "TWSE MIS");
    const rows = validatePayloadRows(payload, { paths: ["msgArray"], requiredFields: ["y"], label: "TWSE MIS" });
    return normalizeTwseMisRow(rows[0], stock, options);
  }

  function parseTwseMisBatchQuotes(text, stocks, options = {}) {
    const payload = parsePayload("twse", text, "TWSE MIS batch");
    const rows = validatePayloadRows(payload, { paths: ["msgArray"], requiredFields: ["c", "y"], label: "TWSE MIS batch" });
    const stockMap = new Map((stocks || []).map((stock) => [String(stock.code), stock]));
    const results = new Map();
    for (const row of rows) {
      const code = String(row?.c || "").trim();
      const stock = stockMap.get(code);
      if (!stock) continue;
      try {
        results.set(code, normalizeTwseMisRow(row, stock, options));
      } catch (_) {}
    }
    return results;
  }

  function parseYahooQuote(text, stock, options = {}) {
    const payload = parsePayload("yahoo", text, "Yahoo Finance quote");
    const results = validatePayloadRows(payload, { paths: ["chart.result"], requiredFields: ["meta"], label: "Yahoo Finance quote" });
    const result = results[0];
    const meta = result.meta;
    const price = toNumber(meta.regularMarketPrice);
    const previousClose = toNumber(meta.chartPreviousClose) ?? toNumber(meta.previousClose);
    if (price === null || previousClose === null) {
      const error = new Error("Yahoo 報價缺價格或昨收");
      error.code = "SOURCE_SCHEMA_DRIFT";
      throw error;
    }
    const change = +(price - previousClose).toFixed(2);
    const pct = previousClose ? +(change / previousClose * 100).toFixed(2) : null;
    const marketTimestamp = toNumber(meta.regularMarketTime) || toNumber(result.timestamp?.at?.(-1));
    const marketDate = marketTimestamp ? new Date(marketTimestamp * 1000) : null;
    const validMarketDate = marketDate && !Number.isNaN(marketDate.getTime()) ? marketDate : null;
    const fallbackNow = options.now ? new Date(options.now) : new Date();
    return {
      code: stock?.code || "",
      name: stock?.name || "",
      price,
      change,
      pct,
      previousClose,
      open: toNumber(meta.regularMarketOpen),
      high: toNumber(meta.regularMarketDayHigh),
      low: toNumber(meta.regularMarketDayLow),
      volume: toNumber(meta.regularMarketVolume),
      averagePrice: null,
      turnover: null,
      navPrice: toNumber(meta.navPrice),
      source: "Yahoo Finance fallback",
      sourceKind: "fallback",
      fallbackUsed: true,
      sourceDate: dateKeyInTaipei(validMarketDate || fallbackNow),
      sourceTime: validMarketDate ? timeKeyInTaipei(validMarketDate) : "",
      marketTime: validMarketDate ? validMarketDate.toISOString() : "",
      exchangeTimezoneName: meta.exchangeTimezoneName || meta.timezone || "",
      capturedAt: options.capturedAt || new Date().toISOString()
    };
  }

  function parseOfficialDailyQuoteRows(text, market) {
    const isTpex = String(market || "").toUpperCase() === "TPEX";
    return validatePayloadRows(parsePayload(isTpex ? "tpex" : "twse", text, `${isTpex ? "TPEx" : "TWSE"} daily quote`), {
      requiredFields: isTpex ? ["SecuritiesCompanyCode", "Close"] : ["Code", "ClosingPrice"],
      label: `${isTpex ? "TPEx" : "TWSE"} daily quote`
    });
  }

  function parseOfficialDailyQuoteRow(row, stock, market, options = {}) {
    if (!row || !stock) return null;
    const isTpex = String(market || "").toUpperCase() === "TPEX";
    const price = toNumber(isTpex ? row.Close : row.ClosingPrice);
    if (price === null) return null;
    const change = toNumber(row.Change);
    const previousClose = change !== null ? +(price - change).toFixed(2) : price;
    const pct = previousClose && change !== null ? +(change / previousClose * 100).toFixed(2) : null;
    const code = String(isTpex ? row.SecuritiesCompanyCode : row.Code || stock.code).trim();
    const name = String(isTpex ? row.CompanyName : row.Name || stock.name).trim();
    const sourceDate = parseRocCompactDate(row.Date);
    return {
      code: stock.code || code,
      name: name || stock.name,
      price,
      change,
      pct,
      previousClose,
      open: toNumber(isTpex ? row.Open : row.OpeningPrice),
      high: toNumber(isTpex ? row.High : row.HighestPrice),
      low: toNumber(isTpex ? row.Low : row.LowestPrice),
      volume: toNumber(isTpex ? row.TradingShares : row.TradeVolume),
      averagePrice: null,
      turnover: toNumber(isTpex ? row.TransactionAmount : row.TradeValue),
      source: isTpex ? "TPEx 官方即時行情備援" : "TWSE 官方收盤表備援",
      sourceKind: "official",
      sourceDate,
      sourceTime: "",
      fallbackUsed: true,
      marketTime: sourceDate,
      capturedAt: options.capturedAt || new Date().toISOString()
    };
  }

  function normalizeKline(row) {
    if (!row || !row.date || row.close === null || row.close === undefined) return null;
    const open = toNumber(row.open);
    const high = toNumber(row.high);
    const low = toNumber(row.low);
    const close = toNumber(row.close);
    if (close === null) return null;
    return {
      date: row.date,
      open: open ?? close,
      high: high ?? close,
      low: low ?? close,
      close,
      volume: toNumber(row.volume) ?? 0,
      turnover: toNumber(row.turnover) ?? toNumber(row.amount) ?? null,
      source: row.source || "unknown"
    };
  }

  function optionalRows(payload, paths, label) {
    const rows = adapters().rowsAt(payload, paths);
    if (!rows) {
      const error = new Error(`${label}缺少預期資料列`);
      error.code = "SOURCE_ROWS_MISSING";
      error.category = "schema";
      error.retryable = false;
      throw error;
    }
    return rows;
  }

  function parseTwseKlines(text, stock) {
    const rows = optionalRows(parsePayload("twse", text, "TWSE STOCK_DAY"), ["data"], "TWSE STOCK_DAY");
    return rows.map((row) => normalizeKline({
      date: parseRocDate(row[0]),
      volume: row[1],
      turnover: row[2],
      open: row[3],
      high: row[4],
      low: row[5],
      close: row[6],
      source: `TWSE STOCK_DAY ${stock.code}`
    })).filter(Boolean);
  }

  function parseTpexKlines(text, stock) {
    const rows = optionalRows(parsePayload("tpex", text, "TPEx tradingStock"), ["tables.0.data"], "TPEx tradingStock");
    return rows.map((row) => normalizeKline({
      date: parseRocDate(row[0]),
      volume: toNumber(row[1]) !== null ? toNumber(row[1]) * 1000 : null,
      turnover: row[2],
      open: row[3],
      high: row[4],
      low: row[5],
      close: row[6],
      source: `TPEx tradingStock ${stock.code}`
    })).filter(Boolean);
  }

  function parseYahooKlines(text, stock) {
    const results = validatePayloadRows(parsePayload("yahoo", text, "Yahoo Finance history"), {
      paths: ["chart.result"],
      requiredFields: ["timestamp", "indicators"],
      label: "Yahoo Finance history"
    });
    const result = results[0];
    const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
    const quote = Array.isArray(result.indicators?.quote) ? result.indicators.quote[0] : null;
    if (!timestamps.length || !quote) return [];
    return timestamps.map((timestamp, index) => normalizeKline({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: quote.open ? quote.open[index] : null,
      high: quote.high ? quote.high[index] : null,
      low: quote.low ? quote.low[index] : null,
      close: quote.close ? quote.close[index] : null,
      volume: quote.volume ? quote.volume[index] : null,
      turnover: null,
      source: `Yahoo history fallback ${stock.code}.${stock.suffix}`
    })).filter(Boolean);
  }

  function normalizeValuationRecord(record, options = {}) {
    return {
      code: record.code,
      name: record.name,
      market: record.market,
      close: record.close ?? null,
      pe: record.pe ?? null,
      dividendYield: record.dividendYield ?? null,
      dividendPerShare: record.dividendPerShare ?? null,
      dividendYear: record.dividendYear || "",
      pbr: record.pbr ?? null,
      reportPeriod: record.reportPeriod || "",
      sourceDate: record.sourceDate || "",
      sourceLabel: record.sourceLabel || "",
      fetchedAt: options.fetchedAt || new Date().toISOString()
    };
  }

  function trackedCodeSet(value) {
    return new Set(Array.isArray(value) ? value.map(String) : []);
  }

  function parseTwseValuations(text, options = {}) {
    const payload = parsePayload("twse", text, "TWSE official valuation");
    const rows = validatePayloadRows(payload, { paths: ["data"], label: "TWSE official valuation" });
    const sourceDate = parseCompactDay(payload.date);
    const trackedCodes = trackedCodeSet(options.trackedCodes);
    const records = {};
    const universeRecords = {};
    for (const row of rows) {
      const code = String(row[0] || "").trim();
      if (!/^\d{4}$/.test(code)) continue;
      const normalized = normalizeValuationRecord({
        code,
        name: officialTextValue(row[1]),
        market: "TW",
        close: officialNumberValue(row[2]),
        dividendYield: officialNumberValue(row[3]),
        dividendYear: officialTextValue(row[4]),
        pe: officialNumberValue(row[5]),
        pbr: officialNumberValue(row[6]),
        reportPeriod: officialTextValue(row[7]),
        sourceDate,
        sourceLabel: "TWSE 官方估值"
      }, options);
      universeRecords[code] = normalized;
      if (trackedCodes.has(code)) records[code] = normalized;
    }
    if (!Object.keys(records).length) throw new Error("TWSE 估值資料未涵蓋追蹤名單");
    return {
      market: "TW",
      title: payload.title || "",
      sourceDate,
      sourceLabel: "TWSE 官方估值",
      records,
      universeRecords
    };
  }

  function parseTpexValuations(text, options = {}) {
    const payload = parsePayload("tpex", text, "TPEx official valuation");
    const table = Array.isArray(payload.tables) ? payload.tables[0] : null;
    const rows = validatePayloadRows(payload, { paths: ["tables.0.data"], label: "TPEx official valuation" });
    const sourceDate = parseRocDate(table?.date || payload.date);
    const trackedCodes = trackedCodeSet(options.trackedCodes);
    const records = {};
    for (const row of rows) {
      const code = String(row[0] || "").trim();
      if (!trackedCodes.has(code)) continue;
      records[code] = normalizeValuationRecord({
        code,
        name: officialTextValue(row[1]),
        market: "TWO",
        close: null,
        pe: officialNumberValue(row[2]),
        dividendPerShare: officialNumberValue(row[3]),
        dividendYear: officialTextValue(row[4]),
        dividendYield: officialNumberValue(row[5]),
        pbr: officialNumberValue(row[6]),
        reportPeriod: officialTextValue(row[7]),
        sourceDate,
        sourceLabel: "TPEx 官方估值"
      }, options);
    }
    if (!Object.keys(records).length) throw new Error("TPEx 估值資料未涵蓋追蹤名單");
    return {
      market: "TWO",
      title: table?.title || "",
      sourceDate,
      sourceLabel: "TPEx 官方估值",
      records
    };
  }

  const api = Object.freeze({
    version: VERSION,
    parseTwseMisQuote,
    parseTwseMisBatchQuotes,
    parseYahooQuote,
    parseOfficialDailyQuoteRows,
    parseOfficialDailyQuoteRow,
    normalizeKline,
    parseTwseKlines,
    parseTpexKlines,
    parseYahooKlines,
    normalizeValuationRecord,
    parseTwseValuations,
    parseTpexValuations
  });

  root.TwStockMarketDataNormalizers = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
