#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "data/live_market.json");
const DEPLOYED_SNAPSHOT_URL = "https://otakuzerg.github.io/twstock-tracker-web/data/live_market.json";
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15000;
const SCHEDULE_MINUTES = 15;
const TAIPEI_TIME_ZONE = "Asia/Taipei";
const US_TIME_ZONE = "America/New_York";

const TAIWAN_INDEX = {
  key: "taiex",
  label: "台灣加權指數",
  symbol: "^TWII",
  timeZone: TAIPEI_TIME_ZONE,
  yahooUrl: "https://tw.stock.yahoo.com/quote/%5ETWII"
};

const GLOBAL_INDICES = [
  { key: "dow", label: "道瓊工業指數", symbol: "^DJI", timeZone: US_TIME_ZONE, yahooUrl: "https://finance.yahoo.com/quote/%5EDJI", cboeSymbol: "DJX", cboeScale: 100 },
  { key: "sp500", label: "S&P 500 指數", symbol: "^GSPC", timeZone: US_TIME_ZONE, yahooUrl: "https://finance.yahoo.com/quote/%5EGSPC", cboeSymbol: "SPX", cboeScale: 1 },
  { key: "nasdaq", label: "NASDAQ 指數", symbol: "^IXIC", timeZone: US_TIME_ZONE, yahooUrl: "https://finance.yahoo.com/quote/%5EIXIC", cboeSymbol: "NDX", cboeScale: 1 },
  { key: "sox", label: "費城半導體", symbol: "^SOX", timeZone: US_TIME_ZONE, yahooUrl: "https://finance.yahoo.com/quote/%5ESOX", cboeSymbol: "SOX", cboeScale: 1 }
];

const TAIFEX_SOURCE_LINKS = [
  { label: "TAIFEX 夜盤", url: "https://mis.taifex.com.tw/futures/AfterHoursSession/EquityIndices/FuturesDomestic/" },
  { label: "CMoney TXF1", url: "https://www.cmoney.tw/forum/futures/TXF1?s=p" },
  { label: "WantGoo WTXP", url: "https://www.wantgoo.com/futures/wtxp" }
];

const FIXED_FETCH_RULES = [
  { host: "query1.finance.yahoo.com", path: /^\/v8\/finance\/chart\/%5E(?:TWII|DJI|GSPC|IXIC|SOX)$/i },
  { host: "mis.twse.com.tw", path: /^\/stock\/api\/getStockInfo\.jsp$/ },
  { host: "www.twse.com.tw", path: /^\/rwd\/zh\/afterTrading\/MI_INDEX$/ },
  { host: "mis.taifex.com.tw", path: /^\/futures\/api\/getQuoteList$/ },
  { host: "www.cmoney.tw", path: /^\/forum\/futures\/TXF1$/ },
  { host: "cdn.cboe.com", path: /^\/api\/global\/delayed_quotes\/quotes\/(?:_DJX|_SPX|_NDX|_SOX)\.json$/ },
  { host: "otakuzerg.github.io", path: /^\/twstock-tracker-web\/data\/live_market\.json$/ }
];

function parseArgs(argv) {
  const args = { output: DEFAULT_OUTPUT, selfTest: false, remoteFallback: true };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output") args.output = path.resolve(argv[++index]);
    else if (token === "--self-test") args.selfTest = true;
    else if (token === "--no-remote-fallback") args.remoteFallback = false;
    else if (token === "--help" || token === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(/,/g, "").replace(/%/g, "").trim();
  if (!normalized || normalized === "--" || normalized === "-") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function compactDate(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 8) return "";
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function timestampLabel(timestamp, timeZone) {
  if (!Number.isFinite(Number(timestamp))) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(Number(timestamp) * 1000));
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function cleanError(error) {
  return String(error?.message || error || "unknown error").replace(/\s+/g, " ").slice(0, 240);
}

function assertFixedFetchUrl(value) {
  const parsed = new URL(String(value));
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Only fixed HTTPS market sources are allowed");
  const allowed = FIXED_FETCH_RULES.some((rule) => parsed.hostname === rule.host && rule.path.test(parsed.pathname));
  if (!allowed) throw new Error(`Market snapshot source is not allowlisted: ${parsed.hostname}${parsed.pathname}`);
  return parsed;
}

async function readLimitedText(response) {
  const announced = Number(response.headers.get("content-length") || 0);
  if (announced > MAX_RESPONSE_BYTES) throw new Error(`Response exceeds ${MAX_RESPONSE_BYTES} bytes`);
  if (!response.body?.getReader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_BYTES) throw new Error(`Response exceeds ${MAX_RESPONSE_BYTES} bytes`);
    return new TextDecoder().decode(buffer);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel("response too large");
      throw new Error(`Response exceeds ${MAX_RESPONSE_BYTES} bytes`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function fetchFixedText(url, options, fetchLog) {
  const parsed = assertFixedFetchUrl(url);
  const method = String(options?.method || "GET").toUpperCase();
  if (!new Set(["GET", "POST"]).has(method)) throw new Error(`Method not allowed: ${method}`);
  const body = options?.body ? String(options.body) : undefined;
  if (body && Buffer.byteLength(body, "utf8") > 16384) throw new Error("Request body exceeds 16 KB");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();
  let status = 0;
  let bytes = 0;
  try {
    const response = await fetch(parsed, {
      method,
      body,
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: options?.accept || "application/json,text/plain,text/html;q=0.9,*/*;q=0.5",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
        "User-Agent": "Mozilla/5.0 (compatible; twstock-market-snapshot/1.0; +https://github.com/OtakuZerg/twstock-tracker-web)",
        ...(body ? { "Content-Type": options?.contentType || "application/json" } : {})
      }
    });
    status = response.status;
    const text = await readLimitedText(response);
    bytes = Buffer.byteLength(text, "utf8");
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${parsed.hostname}`);
    fetchLog.push({ source: options?.source || parsed.hostname, host: parsed.hostname, status, bytes, durationMs: Date.now() - startedAt, ok: true });
    return text;
  } catch (error) {
    const message = error?.name === "AbortError" ? `Timeout: ${parsed.hostname}` : cleanError(error);
    fetchLog.push({ source: options?.source || parsed.hostname, host: parsed.hostname, status, bytes, durationMs: Date.now() - startedAt, ok: false, error: message });
    throw new Error(message);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeSeries(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((point, index) => ({
      ts: Number(point?.ts) || index,
      date: String(point?.date || point?.time || ""),
      time: String(point?.time || point?.date || ""),
      value: numberValue(point?.value)
    }))
    .filter((point) => point.value !== null)
    .sort((left, right) => left.ts - right.ts)
    .slice(-120);
}

function appendSeries(rows, point) {
  if (!point || numberValue(point.value) === null) return normalizeSeries(rows);
  const normalizedPoint = { ...point, value: numberValue(point.value) };
  const dayKey = String(normalizedPoint.date || "").slice(0, 5);
  const sameDay = dayKey ? normalizeSeries(rows).filter((row) => String(row.date || "").slice(0, 5) === dayKey) : normalizeSeries(rows);
  const withoutSameTimestamp = sameDay.filter((row) => row.ts !== normalizedPoint.ts);
  return normalizeSeries([...withoutSameTimestamp, normalizedPoint]);
}

function parseYahooChart(payload, config, generatedAt) {
  const result = payload?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo chart has no ${config.symbol} result`);
  const meta = result.meta || {};
  const quote = result.indicators?.quote?.[0] || {};
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const closes = Array.isArray(quote.close) ? quote.close : [];
  const timeZone = meta.exchangeTimezoneName || config.timeZone;
  const series = timestamps.map((timestamp, index) => {
    const value = numberValue(closes[index]);
    if (value === null) return null;
    const label = timestampLabel(timestamp, timeZone);
    return { ts: Number(timestamp), date: label, time: label, value };
  }).filter(Boolean).slice(-120);
  const value = numberValue(meta.regularMarketPrice) ?? series.at(-1)?.value ?? null;
  const previousClose = numberValue(meta.chartPreviousClose) ?? numberValue(meta.previousClose);
  const change = value !== null && previousClose !== null ? value - previousClose : numberValue(meta.regularMarketChange);
  const pct = value !== null && previousClose ? change / previousClose * 100 : numberValue(meta.regularMarketChangePercent);
  return {
    key: config.key,
    label: config.label,
    symbol: config.symbol,
    value,
    previousClose,
    change,
    pct,
    open: numberValue(meta.regularMarketOpen) ?? numberValue(quote.open?.find((item) => numberValue(item) !== null)),
    high: numberValue(meta.regularMarketDayHigh),
    low: numberValue(meta.regularMarketDayLow),
    volume: numberValue(meta.regularMarketVolume),
    turnover100m: null,
    sourceDate: meta.regularMarketTime ? timestampLabel(meta.regularMarketTime, timeZone) : "",
    sourceTime: meta.regularMarketTime ? timestampLabel(meta.regularMarketTime, timeZone) : "",
    timeZone,
    fetchedAt: generatedAt,
    source: "Yahoo Finance chart API（GitHub Actions 快照）",
    sourceTier: "市場資料",
    fallbackUsed: true,
    confidence: "medium",
    url: config.yahooUrl,
    note: "GitHub Actions 定時抓取的延遲快照；交易判讀仍需與官方或第二來源交叉核對。",
    series
  };
}

async function fetchYahooIndex(config, generatedAt, fetchLog) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(config.symbol)}?interval=5m&range=1d`;
  const text = await fetchFixedText(url, { source: `Yahoo ${config.symbol}`, accept: "application/json" }, fetchLog);
  return parseYahooChart(JSON.parse(text), config, generatedAt);
}

function parseTwseMis(payload, previous, generatedAt) {
  const row = Array.isArray(payload?.msgArray) ? payload.msgArray.find((item) => item?.ch === "t00.tw" || item?.c === "t00") : null;
  if (!row) throw new Error("TWSE MIS has no TAIEX row");
  const value = numberValue(row.z);
  const previousClose = numberValue(row.y);
  if (value === null) throw new Error("TWSE MIS TAIEX value is missing");
  const change = previousClose !== null ? value - previousClose : null;
  const pct = change !== null && previousClose ? change / previousClose * 100 : null;
  const date = compactDate(row.d || row["^"]);
  const time = String(row.t || row["%"] || "");
  const timestamp = numberValue(row.tlong) ? Math.floor(numberValue(row.tlong) / 1000) : Math.floor(Date.parse(generatedAt) / 1000);
  const pointLabel = [date.slice(5).replace("-", "/"), time.slice(0, 5)].filter(Boolean).join(" ");
  return {
    key: TAIWAN_INDEX.key,
    label: TAIWAN_INDEX.label,
    symbol: TAIWAN_INDEX.symbol,
    value,
    previousClose,
    change,
    pct,
    open: numberValue(row.o),
    high: numberValue(row.h),
    low: numberValue(row.l),
    volume: numberValue(row.v) ?? numberValue(row.m),
    turnover100m: numberValue(previous?.turnover100m),
    sourceDate: [date, time].filter(Boolean).join(" "),
    sourceTime: time,
    timeZone: TAIPEI_TIME_ZONE,
    fetchedAt: generatedAt,
    source: "TWSE MIS（GitHub Actions 快照）",
    sourceTier: "官方",
    fallbackUsed: false,
    confidence: "high",
    url: "https://mis.twse.com.tw/stock/fibest.jsp?stock=t00&lang=zh_tw",
    note: "指數現值採 TWSE MIS 官方快照；成交金額與完整線圖另以 TWSE 收盤統計 / Yahoo 市場資料補充。",
    series: appendSeries(previous?.series, { ts: timestamp, date: pointLabel, time: pointLabel, value })
  };
}

function stripHtml(value) {
  return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/\s+/g, " ").trim();
}

function marketNumber(value) {
  const text = stripHtml(value).replace(/[▲△＋+]/g, "").replace(/[▼▽−]/g, "-");
  return numberValue(text);
}

function officialAmount100m(value) {
  const amount = marketNumber(value);
  if (amount === null) return null;
  return amount > 1_000_000 ? amount / 100_000_000 : amount;
}

function parseTwseOfficial(payload, sourceType) {
  const tables = Array.isArray(payload?.tables) ? payload.tables : [];
  const rows = tables.flatMap((table) => Array.isArray(table?.data) ? table.data : []);
  const indexRow = rows.find((row) => stripHtml(row?.[0]).includes("發行量加權股價指數"));
  let turnover100m = null;
  for (const table of tables) {
    const fields = Array.isArray(table?.fields) ? table.fields.map(stripHtml) : [];
    const amountIndex = fields.findIndex((field) => /成交金額|成交值/.test(field));
    if (amountIndex < 0) continue;
    const dataRows = Array.isArray(table?.data) ? table.data : [];
    const totalRow = dataRows.find((row) => /總計|合計|集中市場|上市/.test(stripHtml(row?.[0]))) || dataRows[0];
    const amount = officialAmount100m(totalRow?.[amountIndex]);
    if (amount !== null) {
      turnover100m = amount;
      break;
    }
  }
  const close = marketNumber(indexRow?.[1]);
  const point = marketNumber(indexRow?.[3]);
  const pct = marketNumber(indexRow?.[4]);
  const signText = stripHtml(indexRow?.[2]);
  return {
    date: compactDate(payload?.date),
    close,
    change: signText.includes("-") && point !== null ? -Math.abs(point) : point,
    pct,
    turnover100m,
    source: `TWSE MI_INDEX ${sourceType}`,
    url: "https://www.twse.com.tw/zh/trading/historical/mi-index.html"
  };
}

async function fetchTwseMis(previous, generatedAt, fetchLog) {
  const url = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0";
  const text = await fetchFixedText(url, { source: "TWSE MIS", accept: "application/json" }, fetchLog);
  return parseTwseMis(JSON.parse(text), previous, generatedAt);
}

async function fetchTwseOfficial(fetchLog) {
  let lastError = null;
  for (const type of ["MS", "IND"]) {
    try {
      const url = `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?response=json&type=${type}`;
      const text = await fetchFixedText(url, { source: `TWSE MI_INDEX ${type}`, accept: "application/json" }, fetchLog);
      const parsed = parseTwseOfficial(JSON.parse(text), type);
      if (parsed.close !== null || parsed.turnover100m !== null) return parsed;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("TWSE MI_INDEX has no usable data");
}

function mergeTaiwanSources({ mis, yahoo, official, previous, generatedAt, errors }) {
  const primary = mis || yahoo || previous || null;
  if (!primary) return null;
  if (mis && yahoo && mis.value && yahoo.value && Math.abs(mis.value - yahoo.value) / Math.abs(mis.value) > 0.01) {
    errors.push(`台股指數待複核：TWSE ${mis.value} vs Yahoo ${yahoo.value}`);
  }
  const series = yahoo?.series?.length >= 2 ? yahoo.series : (mis?.series || primary.series || []);
  const usedOfficial = Boolean(mis || official);
  return {
    ...primary,
    key: TAIWAN_INDEX.key,
    label: TAIWAN_INDEX.label,
    symbol: TAIWAN_INDEX.symbol,
    turnover100m: official?.turnover100m ?? primary.turnover100m ?? null,
    sourceDate: mis?.sourceDate || yahoo?.sourceDate || official?.date || primary.sourceDate || "",
    sourceTime: mis?.sourceTime || yahoo?.sourceTime || primary.sourceTime || "",
    fetchedAt: mis || yahoo || official ? generatedAt : primary.fetchedAt,
    source: [mis ? "TWSE MIS" : "", yahoo ? "Yahoo Finance chart API" : "", official ? official.source : ""].filter(Boolean).join(" + ") || primary.source,
    sourceTier: usedOfficial ? (yahoo ? "官方 + 市場資料" : "官方") : (primary.sourceTier || "市場資料"),
    fallbackUsed: !mis,
    confidence: mis && official ? "high" : usedOfficial ? "medium-high" : "medium",
    url: official?.url || mis?.url || yahoo?.url || primary.url,
    note: series.length >= 2
      ? "GitHub Actions 定時產生的延遲快照；現值優先採 TWSE 官方，線圖以 Yahoo 或排程累積點補充。"
      : "GitHub Actions 定時產生的延遲快照；目前線圖點數不足，現值仍以 TWSE 官方為優先。",
    series: normalizeSeries(series)
  };
}

async function buildTaiwan(previous, generatedAt, fetchLog, errors, freshSources) {
  const [misResult, yahooResult, officialResult] = await Promise.allSettled([
    fetchTwseMis(previous, generatedAt, fetchLog),
    fetchYahooIndex(TAIWAN_INDEX, generatedAt, fetchLog),
    fetchTwseOfficial(fetchLog)
  ]);
  const mis = misResult.status === "fulfilled" ? misResult.value : null;
  const yahoo = yahooResult.status === "fulfilled" ? yahooResult.value : null;
  const official = officialResult.status === "fulfilled" ? officialResult.value : null;
  if (mis) freshSources.push("TWSE MIS"); else errors.push(`TWSE MIS：${cleanError(misResult.reason)}`);
  if (yahoo) freshSources.push("Yahoo ^TWII"); else errors.push(`Yahoo TWII：${cleanError(yahooResult.reason)}`);
  if (official) freshSources.push("TWSE MI_INDEX"); else errors.push(`TWSE MI_INDEX：${cleanError(officialResult.reason)}`);
  return { snapshot: mergeTaiwanSources({ mis, yahoo, official, previous, generatedAt, errors }), fresh: Boolean(mis || yahoo || official) };
}

function parseCboeQuote(payload, config, previous, generatedAt) {
  const row = payload?.data;
  if (!row || numberValue(row.current_price) === null) throw new Error(`Cboe ${config.cboeSymbol} has no quote`);
  const scale = Number(config.cboeScale) || 1;
  const scaled = (value) => {
    const number = numberValue(value);
    return number === null ? null : number * scale;
  };
  const value = scaled(row.current_price);
  const change = scaled(row.price_change);
  const previousClose = change !== null ? value - change : scaled(row.prev_day_close);
  const sourceDate = String(row.last_trade_time || payload.timestamp || "");
  const timestamp = Number.isFinite(Date.parse(sourceDate)) ? Math.floor(Date.parse(sourceDate) / 1000) : Math.floor(Date.parse(generatedAt) / 1000);
  const label = timestampLabel(timestamp, config.timeZone);
  const isNasdaqProxy = config.cboeSymbol === "NDX";
  return {
    key: config.key,
    label: isNasdaqProxy ? "NASDAQ 100（NDX 備援）" : config.label,
    symbol: isNasdaqProxy ? "^NDX" : config.symbol,
    value,
    previousClose,
    change,
    pct: numberValue(row.price_change_percent),
    open: scaled(row.open),
    high: scaled(row.high),
    low: scaled(row.low),
    volume: numberValue(row.volume),
    turnover100m: null,
    sourceDate,
    sourceTime: sourceDate,
    timeZone: config.timeZone,
    fetchedAt: generatedAt,
    source: `Cboe ${config.cboeSymbol} delayed quote（GitHub Actions 快照）`,
    sourceTier: "官方市場資料備援",
    fallbackUsed: true,
    confidence: isNasdaqProxy ? "low-medium" : "medium-high",
    url: `https://www.cboe.com/us/indices/dashboard/${config.cboeSymbol.toLowerCase()}/`,
    note: isNasdaqProxy
      ? "Yahoo NASDAQ Composite 失敗時暫以不同口徑的 Cboe NDX（NASDAQ 100）備援，已明確改名，不可視為同一指數。"
      : config.cboeSymbol === "DJX"
        ? "Yahoo 道瓊失敗時以 Cboe DJX × 100 備援；屬延遲快照，仍需回原站核對。"
        : "Yahoo 來源失敗時使用 Cboe 官方延遲指數快照。",
    series: appendSeries(previous?.series, { ts: timestamp, date: label, time: label, value })
  };
}

async function fetchCboeIndex(config, previous, generatedAt, fetchLog) {
  const url = `https://cdn.cboe.com/api/global/delayed_quotes/quotes/_${config.cboeSymbol}.json`;
  const text = await fetchFixedText(url, { source: `Cboe ${config.cboeSymbol}`, accept: "application/json" }, fetchLog);
  return parseCboeQuote(JSON.parse(text), config, previous, generatedAt);
}

async function buildGlobalIndex(config, previous, generatedAt, fetchLog, errors, freshSources) {
  try {
    const yahoo = await fetchYahooIndex(config, generatedAt, fetchLog);
    freshSources.push(`Yahoo ${config.symbol}`);
    return { snapshot: yahoo, fresh: true };
  } catch (yahooError) {
    errors.push(`${config.label} Yahoo：${cleanError(yahooError)}`);
    try {
      const cboe = await fetchCboeIndex(config, previous, generatedAt, fetchLog);
      freshSources.push(`Cboe ${config.cboeSymbol}`);
      return { snapshot: cboe, fresh: true };
    } catch (cboeError) {
      errors.push(`${config.label} Cboe：${cleanError(cboeError)}`);
      return { snapshot: previous || null, fresh: false };
    }
  }
}

function parseTaifexQuote(payload, generatedAt) {
  const rows = Array.isArray(payload?.RtData?.QuoteList) ? payload.RtData.QuoteList : [];
  const quotes = rows.filter((row) => String(row?.SymbolID || "").includes("-M"));
  const row = quotes.sort((left, right) => (numberValue(right.CTotalVolume) || 0) - (numberValue(left.CTotalVolume) || 0))[0];
  if (!row) throw new Error("TAIFEX night quote list is empty");
  const value = numberValue(row.CLastPrice);
  const previousClose = numberValue(row.CRefPrice);
  if (value === null) throw new Error("TAIFEX night quote has no last price");
  const change = numberValue(row.CDiff) ?? (previousClose !== null ? value - previousClose : null);
  const pct = numberValue(row.CDiffRate) ?? (change !== null && previousClose ? change / previousClose * 100 : null);
  const sourceDate = compactDate(row.CDate);
  const sourceTime = String(row.CTime || "").replace(/^(\d{2})(\d{2})(\d{2})$/, "$1:$2:$3");
  return {
    key: "taifex-night-txf",
    label: "台指期夜盤 TXF",
    symbol: String(row.SymbolID || "TXF"),
    value,
    previousClose,
    change,
    pct,
    open: numberValue(row.COpenPrice),
    high: numberValue(row.CHighPrice),
    low: numberValue(row.CLowPrice),
    volume: numberValue(row.CTotalVolume),
    turnover100m: null,
    sourceDate: [sourceDate, sourceTime].filter(Boolean).join(" "),
    sourceTime,
    timeZone: TAIPEI_TIME_ZONE,
    fetchedAt: generatedAt,
    source: "TAIFEX 盤後交易即時行情 API（GitHub Actions 快照）",
    sourceTier: "官方",
    fallbackUsed: false,
    confidence: "medium-high",
    url: TAIFEX_SOURCE_LINKS[0].url,
    sourceLinks: TAIFEX_SOURCE_LINKS,
    note: "GitHub Actions 定時抓取的延遲快照；請以 TAIFEX 官方行情頁核對。",
    series: [
      { ts: 1, date: "昨收", time: "昨收", value: previousClose },
      { ts: 2, date: "開", time: "開", value: numberValue(row.COpenPrice) },
      { ts: 3, date: "高", time: "高", value: numberValue(row.CHighPrice) },
      { ts: 4, date: "低", time: "低", value: numberValue(row.CLowPrice) },
      { ts: 5, date: "現", time: "現", value }
    ].filter((point) => point.value !== null)
  };
}

function jsonLdBlocks(html) {
  const blocks = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(String(html || "")))) {
    try {
      blocks.push(JSON.parse(match[1].trim()));
    } catch (_) {}
  }
  return blocks;
}

function walkJson(value, predicate) {
  const queue = Array.isArray(value) ? [...value] : [value];
  const seen = new Set();
  while (queue.length) {
    const item = queue.shift();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);
    if (predicate(item)) return item;
    if (Array.isArray(item)) queue.push(...item);
    else queue.push(...Object.values(item).filter((child) => child && typeof child === "object"));
  }
  return null;
}

function cmoneyProperty(entity, name) {
  return entity?.additionalProperty?.find((item) => item?.name === name)?.value ?? null;
}

function parseCmoneyTxf(html, generatedAt) {
  const blocks = jsonLdBlocks(html);
  const entity = blocks.map((block) => walkJson(block, (item) => String(item.tickerSymbol || "").toUpperCase() === "TXF1" && Array.isArray(item.additionalProperty))).find(Boolean);
  if (!entity) throw new Error("CMoney TXF1 JSON-LD entity is missing");
  const webPage = blocks.map((block) => walkJson(block, (item) => String(item["@type"] || "") === "WebPage" && item.dateModified)).find(Boolean);
  const value = numberValue(cmoneyProperty(entity, "成交"));
  const previousClose = numberValue(cmoneyProperty(entity, "昨收"));
  if (value === null) throw new Error("CMoney TXF1 has no last price");
  const change = numberValue(cmoneyProperty(entity, "漲跌")) ?? (previousClose !== null ? value - previousClose : null);
  const pct = numberValue(cmoneyProperty(entity, "漲跌幅")) ?? (change !== null && previousClose ? change / previousClose * 100 : null);
  const open = numberValue(cmoneyProperty(entity, "開盤"));
  const high = numberValue(cmoneyProperty(entity, "最高"));
  const low = numberValue(cmoneyProperty(entity, "最低"));
  return {
    key: "cmoney-taifex-night-txf",
    label: "台指期夜盤 TXF",
    symbol: "TXF1",
    value,
    previousClose,
    change,
    pct,
    open,
    high,
    low,
    volume: numberValue(cmoneyProperty(entity, "總量")),
    turnover100m: numberValue(cmoneyProperty(entity, "金額(億)")),
    sourceDate: String(webPage?.dateModified || ""),
    sourceTime: "",
    timeZone: TAIPEI_TIME_ZONE,
    fetchedAt: generatedAt,
    source: "CMoney TXF1 JSON-LD（GitHub Actions 快照）",
    sourceTier: "市場資料備援",
    fallbackUsed: true,
    confidence: "medium",
    url: TAIFEX_SOURCE_LINKS[1].url,
    sourceLinks: TAIFEX_SOURCE_LINKS,
    note: "TAIFEX 官方夜盤未回可用資料時的定時備援快照；交易判讀仍以 TAIFEX 官方行情優先。",
    series: [
      { ts: 1, date: "昨收", time: "昨收", value: previousClose },
      { ts: 2, date: "開", time: "開", value: open },
      { ts: 3, date: "高", time: "高", value: high },
      { ts: 4, date: "低", time: "低", value: low },
      { ts: 5, date: "現", time: "現", value }
    ].filter((point) => point.value !== null)
  };
}

async function fetchTaifexOfficial(generatedAt, fetchLog) {
  const url = "https://mis.taifex.com.tw/futures/api/getQuoteList";
  const body = JSON.stringify({ MarketType: "1", SymbolType: "F", KindID: "1", CID: "TXF", ExpireMonth: "", RowSize: "全部", PageNo: "", SortColumn: "", AscDesc: "A" });
  const text = await fetchFixedText(url, { source: "TAIFEX night", method: "POST", body, contentType: "application/json", accept: "application/json" }, fetchLog);
  return parseTaifexQuote(JSON.parse(text), generatedAt);
}

async function fetchCmoneyTxf(generatedAt, fetchLog) {
  const url = TAIFEX_SOURCE_LINKS[1].url;
  const text = await fetchFixedText(url, { source: "CMoney TXF1", accept: "text/html" }, fetchLog);
  return parseCmoneyTxf(text, generatedAt);
}

async function buildTaifex(previous, generatedAt, fetchLog, errors, freshSources) {
  try {
    const official = await fetchTaifexOfficial(generatedAt, fetchLog);
    freshSources.push("TAIFEX night");
    return { snapshot: official, fresh: true };
  } catch (officialError) {
    errors.push(`TAIFEX 夜盤：${cleanError(officialError)}`);
    try {
      const cmoney = await fetchCmoneyTxf(generatedAt, fetchLog);
      freshSources.push("CMoney TXF1");
      return { snapshot: cmoney, fresh: true };
    } catch (cmoneyError) {
      errors.push(`CMoney TXF1：${cleanError(cmoneyError)}`);
      return { snapshot: previous || null, fresh: false };
    }
  }
}

function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return null;
  }
}

function snapshotTimestamp(payload) {
  return Date.parse(payload?.delivery?.generatedAt || payload?.marketDashboardCache?.fetchedAt || "") || 0;
}

function validSnapshotPayload(payload) {
  const cache = payload?.marketDashboardCache;
  return Boolean(payload && typeof payload === "object" && cache && typeof cache === "object");
}

async function loadPreviousSnapshot(outputPath, remoteFallback, fetchLog) {
  const candidates = [
    readJsonIfPresent(outputPath),
    readJsonIfPresent(path.join(REPO_ROOT, "data/live_market.json"))
  ].filter(validSnapshotPayload);
  const state = readJsonIfPresent(path.join(REPO_ROOT, "data/state_core.json"));
  if (state?.marketDashboardCache) {
    candidates.push({ schemaVersion: 1, delivery: { mode: "bundled-fallback", generatedAt: state.marketDashboardCache.fetchedAt || state.savedAt || null }, marketDashboardCache: state.marketDashboardCache });
  }
  if (remoteFallback) {
    try {
      const text = await fetchFixedText(DEPLOYED_SNAPSHOT_URL, { source: "deployed snapshot", accept: "application/json" }, fetchLog);
      const remote = JSON.parse(text);
      if (validSnapshotPayload(remote)) candidates.push(remote);
    } catch (_) {}
  }
  return candidates.sort((left, right) => snapshotTimestamp(right) - snapshotTimestamp(left))[0] || { schemaVersion: 1, delivery: {}, marketDashboardCache: {} };
}

function previousGlobal(cache, key) {
  return Array.isArray(cache?.global) ? cache.global.find((item) => item?.key === key) || null : null;
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o644, flag: "wx" });
  fs.renameSync(tempPath, filePath);
}

async function buildSnapshot(args) {
  const generatedAt = new Date().toISOString();
  const fetchLog = [];
  const errors = [];
  const freshSources = [];
  const previousPayload = await loadPreviousSnapshot(args.output, args.remoteFallback, fetchLog);
  const previous = previousPayload.marketDashboardCache || {};

  const [taiwanResult, taifexResult, ...globalResults] = await Promise.all([
    buildTaiwan(previous.taiwan, generatedAt, fetchLog, errors, freshSources),
    buildTaifex(previous.taifexNight, generatedAt, fetchLog, errors, freshSources),
    ...GLOBAL_INDICES.map((config) => buildGlobalIndex(config, previousGlobal(previous, config.key), generatedAt, fetchLog, errors, freshSources))
  ]);

  const global = globalResults.map((result) => result.snapshot).filter(Boolean);
  const fresh = [taiwanResult, taifexResult, ...globalResults].some((result) => result.fresh);
  const hasData = Boolean(taiwanResult.snapshot || taifexResult.snapshot || global.length);
  if (!hasData) throw new Error("No fresh or previous market snapshot is available");
  const marketDashboardCache = {
    ts: fresh ? Date.now() : Number(previous.ts) || 0,
    fetchedAt: fresh ? generatedAt : previous.fetchedAt || null,
    taiwan: taiwanResult.snapshot || null,
    taifexNight: taifexResult.snapshot || null,
    global,
    errors: uniqueStrings(errors).slice(-8),
    delivery: {
      mode: "github-actions-delayed-snapshot",
      generatedAt,
      scheduleMinutes: SCHEDULE_MINUTES,
      freshSources: uniqueStrings(freshSources),
      note: "公開網站使用 GitHub Actions 定時快照；排程與上游來源可能延遲，非逐筆即時行情。"
    }
  };
  const payload = {
    schemaVersion: 1,
    delivery: marketDashboardCache.delivery,
    marketDashboardCache,
    fetchLog
  };
  writeJsonAtomic(args.output, payload);
  return {
    ok: true,
    output: args.output,
    generatedAt,
    fresh,
    freshSources: marketDashboardCache.delivery.freshSources,
    errors: marketDashboardCache.errors,
    fetches: fetchLog.map(({ source, host, status, bytes, durationMs, ok }) => ({ source, host, status, bytes, durationMs, ok }))
  };
}

function selfTest() {
  const generatedAt = "2026-07-13T13:30:00.000Z";
  const yahoo = parseYahooChart({ chart: { result: [{ meta: { regularMarketPrice: 100, chartPreviousClose: 98, regularMarketTime: 1783949400, exchangeTimezoneName: US_TIME_ZONE }, timestamp: [1783949400], indicators: { quote: [{ close: [100], open: [99] }] } }] } }, GLOBAL_INDICES[0], generatedAt);
  const twse = parseTwseMis({ msgArray: [{ ch: "t00.tw", z: "45380.52", y: "45354.61", o: "45500.32", h: "46330.91", l: "45272.90", d: "20260713", t: "13:33:00", tlong: "1783920780000" }] }, null, generatedAt);
  const cmoney = parseCmoneyTxf(`<script type="application/ld+json">[{"@graph":[{"@type":"WebPage","dateModified":"2026-07-13T05:00:00Z"},{"@type":"Corporation","tickerSymbol":"TXF1","additionalProperty":[{"name":"成交","value":"45659.00"},{"name":"昨收","value":45565},{"name":"漲跌","value":"94.00"},{"name":"漲跌幅","value":"0.21"},{"name":"總量","value":"12855.00"}]}]}]</script>`, generatedAt);
  const cboe = parseCboeQuote({ data: { current_price: 526.37, price_change: 1.5, price_change_percent: 0.285, last_trade_time: "2026-07-13T09:30:00" } }, GLOBAL_INDICES[0], null, generatedAt);
  const checks = {
    yahoo: yahoo.value === 100 && Math.round(yahoo.pct * 100) === 204,
    twse: twse.value === 45380.52 && twse.series.length === 1,
    cmoney: cmoney.value === 45659 && cmoney.change === 94,
    cboe: cboe.value === 52637 && cboe.change === 150,
    fixedUrlRejects: false
  };
  try {
    assertFixedFetchUrl("https://example.com/?url=http://127.0.0.1");
  } catch (_) {
    checks.fixedUrlRejects = true;
  }
  if (Object.values(checks).some((value) => value !== true)) throw new Error(`Market snapshot self-test failed: ${JSON.stringify(checks)}`);
  return { ok: true, checks };
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write("Usage: node scripts/build_market_snapshot.mjs [--output PATH] [--no-remote-fallback] [--self-test]\n");
} else if (args.selfTest) {
  process.stdout.write(`${JSON.stringify(selfTest(), null, 2)}\n`);
} else {
  buildSnapshot(args)
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${cleanError(error)}\n`);
      process.exitCode = 1;
    });
}
