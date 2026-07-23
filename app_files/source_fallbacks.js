"use strict";

(function attachSourceFallbacks(root) {
  const VERSION = "source-fallbacks-v1";
  const CNYES_SOURCE = "鉅亨網個股頁 fallback";

  function sourceError(message, code = "SOURCE_SCHEMA", category = "schema") {
    const error = new Error(message);
    error.code = code;
    error.category = category;
    error.retryable = false;
    return error;
  }

  function finiteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function taipeiParts(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return { date: "", time: "" };
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).formatToParts(date).reduce((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      time: `${parts.hour}:${parts.minute}:${parts.second}`
    };
  }

  function extractAssignedJson(html, variableName = "__NEXT_DATA__") {
    const source = String(html || "");
    const escapedName = String(variableName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const marker = new RegExp(`(?:self\\.)?${escapedName}\\s*=\\s*`, "g");
    const match = marker.exec(source);
    if (!match) throw sourceError(`頁面缺少 ${variableName} 結構`, "SOURCE_EMBEDDED_JSON_MISSING");
    const start = source.indexOf("{", match.index + match[0].length);
    if (start < 0) throw sourceError(`${variableName} 不是 JSON object`, "SOURCE_EMBEDDED_JSON_INVALID");

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(source.slice(start, index + 1));
          } catch (error) {
            throw sourceError(`${variableName} JSON 解析失敗：${error.message}`, "SOURCE_EMBEDDED_JSON_INVALID");
          }
        }
      }
    }
    throw sourceError(`${variableName} JSON 結構不完整`, "SOURCE_EMBEDDED_JSON_TRUNCATED");
  }

  function cnyesStockUrl(stockOrCode) {
    const code = String(stockOrCode?.code || stockOrCode || "").trim();
    return `https://www.cnyes.com/twstock/${encodeURIComponent(code)}/`;
  }

  function wantgooStockUrl(stockOrCode) {
    const code = String(stockOrCode?.code || stockOrCode || "").trim();
    return `https://www.wantgoo.com/stock/${encodeURIComponent(code)}`;
  }

  function goodinfoStockUrl(stockOrCode) {
    const code = String(stockOrCode?.code || stockOrCode || "").trim();
    return `https://goodinfo.tw/tw/StockDetail.asp?STOCK_ID=${encodeURIComponent(code)}`;
  }

  function parseCnyesStockPage(html, stock, options = {}) {
    const page = String(html || "");
    const brokerChallenge = root.TwStockRequestBroker?.detectChallenge?.(page);
    const localChallenge = /cdn-cgi\/challenge-platform|__CF\$cv|cf-chl-|window\.location\.replace\([^)]*REINIT/i.test(page);
    if (brokerChallenge || localChallenge) {
      throw sourceError("鉅亨網回傳網站驗證頁，無法作為報價備援", "SOURCE_WAF_CHALLENGE", "waf-challenge");
    }

    const code = String(stock?.code || "").trim();
    if (!code) throw sourceError("鉅亨網 parser 缺少個股代碼", "SOURCE_STOCK_CODE_MISSING");
    const payload = extractAssignedJson(page, "__NEXT_DATA__");
    const pageProps = payload?.props?.pageProps || {};
    const quote = pageProps.quote;
    if (!quote || typeof quote !== "object" || Array.isArray(quote)) {
      throw sourceError("鉅亨網個股頁缺少 quote 結構", "SOURCE_QUOTE_MISSING");
    }

    const pageCode = String(quote["200010"] || quote.code || "").trim();
    const symbol = String(quote["0"] || "");
    if (pageCode !== code || (symbol && !symbol.includes(`:${code}:`))) {
      throw sourceError(`鉅亨網頁面代碼不符：預期 ${code}，取得 ${pageCode || symbol || "unknown"}`, "SOURCE_STOCK_CODE_MISMATCH");
    }

    const price = finiteNumber(quote["6"]);
    if (price === null || price <= 0) throw sourceError(`鉅亨網 ${code} 缺有效成交價`, "SOURCE_PRICE_MISSING");
    const previousClose = finiteNumber(quote["19"]);
    const reportedChange = finiteNumber(quote["11"]);
    const change = reportedChange ?? (previousClose === null ? null : +(price - previousClose).toFixed(2));
    const reportedPct = finiteNumber(quote["56"]);
    const pct = reportedPct ?? (previousClose && change !== null ? +(change / previousClose * 100).toFixed(2) : null);
    const epochSeconds = finiteNumber(quote["200007"]);
    const marketDate = epochSeconds && epochSeconds > 0 ? new Date(epochSeconds * 1000) : null;
    const marketParts = marketDate ? taipeiParts(marketDate) : { date: "", time: "" };
    const capturedAt = options.fetchedAt || new Date().toISOString();
    const rawVolumeThousands = finiteNumber(quote["200013"]);
    const sourceUrl = options.sourceUrl || cnyesStockUrl(code);

    return {
      code,
      name: String(quote["200009"] || stock?.name || "").trim(),
      price,
      change,
      pct,
      previousClose,
      open: finiteNumber(quote["21"]),
      high: finiteNumber(quote["12"]),
      low: finiteNumber(quote["13"]),
      volume: rawVolumeThousands === null ? null : Math.round(rawVolumeThousands * 1000),
      averagePrice: null,
      turnover: null,
      pe: finiteNumber(quote["36"]),
      pb: finiteNumber(quote["700006"]),
      marketCap: finiteNumber(quote["700005"]),
      source: CNYES_SOURCE,
      sourceTier: "Tier 2 市場資料",
      sourceKind: "fallback",
      fallbackUsed: true,
      confidence: "medium",
      sourceDate: marketParts.date,
      sourceTime: marketParts.time,
      asOf: marketDate && !Number.isNaN(marketDate.getTime()) ? marketDate.toISOString() : "",
      marketTime: marketDate && !Number.isNaN(marketDate.getTime()) ? marketDate.toISOString() : "",
      capturedAt,
      fetchedAt: capturedAt,
      sourceUrl,
      provenance: {
        source: CNYES_SOURCE,
        sourceTier: "Tier 2 市場資料",
        asOf: marketDate && !Number.isNaN(marketDate.getTime()) ? marketDate.toISOString() : "",
        fetchedAt: capturedAt,
        fallbackUsed: true,
        confidence: "medium",
        rawVolumeUnit: "thousand-shares",
        canonicalSourceNote: "僅在 TWSE MIS、Yahoo 與 TWSE／TPEx 官方收盤表皆失敗時使用；交易判讀仍應回查官方資料。"
      },
      crossCheckLinks: {
        cnyes: cnyesStockUrl(code),
        wantgoo: wantgooStockUrl(code),
        goodinfo: goodinfoStockUrl(code)
      }
    };
  }

  root.TwStockSourceFallbacks = Object.freeze({
    version: VERSION,
    extractAssignedJson,
    parseCnyesStockPage,
    cnyesStockUrl,
    wantgooStockUrl,
    goodinfoStockUrl
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
